const express = require("express");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const Company = require("../models/Company");
// Business claims (created at business sign-up, cleared on account recovery)
const CompanyClaim = require("../models/CompanyClaim");
// ObjectId check for claimCompanyId
const mongoose = require("mongoose");
const { protect } = require("../middleware/authMiddleware");
const sendEmail = require("../utils/sendEmail");
const emailTemplates = require("../utils/emailTemplates");
const router = express.Router();

// Google ID tokens are verified with Google's official library (checks the
// signature, expiry, issuer and that the token was issued for OUR client ID).
// Other social tokens are verified with native fetch (Node 18+).
const googleClient = new OAuth2Client();

// Login tokens carry the user's tokenVersion so they can be revoked (utils/token.js)
const { generateToken } = require("../utils/token");

// Plain-text request values only (objects like {"$ne": null} become "")
const { asText, asPassword, isValidEmail, normalizeHttpUrl } = require("../utils/input");
// Exact, case-insensitive name match with regex characters escaped
const { exactTextFilter } = require("../utils/brands");
// Logs unexpected errors and answers without leaking internal details
const { sendServerError } = require("../utils/http");

// Helper to get the frontend URL (used in email links)
const getClientUrl = () => {
  return process.env.CLIENT_URL || "https://trustpilotafrica.com";
};

// Helper to check if a user has no real profile photo yet
// (empty, or the old via.placeholder.com value older accounts were saved with)
const hasNoRealProfileImage = (user) => {
  return !user.profileImage || user.profileImage.startsWith("https://via.placeholder.com/");
};

/**
 * @route   POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  try {
    // Plain-text values only (see asText)
    const name = asText(req.body.name);
    const email = asText(req.body.email);
    const password = asPassword(req.body.password);
    const profileImage = asText(req.body.profileImage);

    // Basic checks before touching the database
    if (!name || name.length > 100) {
      return res.status(400).json({ error: "Please enter your name (up to 100 characters)" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    const userExists = await User.findByEmail(email);
    if (userExists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Only a web image link is kept as the profile picture
    const user = await User.create({
      name,
      email,
      password,
      profileImage: /^https?:\/\//i.test(profileImage) ? profileImage : "",
    });

    // Generate email verification token
    const verifyToken = user.getEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Build verification URL
    const verifyUrl = `${getClientUrl()}/verify-email/${verifyToken}`;

    // Send verification email
    try {
      await sendEmail({
        email: user.email,
        subject: "Trustpilotafrica - Verify Your Email",
        html: emailTemplates.emailVerification({
          userName: user.name,
          verifyUrl,
        }),
      });
    } catch (emailErr) {
      console.error("Verification email send error:", emailErr);
      // Don't block registration if email fails — they can request a new one
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      isAdmin: user.isAdmin,
      isEmailVerified: false,
      token: generateToken(user),
      message: "Account created! Please check your email to verify your account.",
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

/**
 * @route   POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    // Plain-text values only (see asText)
    const email = asText(req.body.email);
    const password = asPassword(req.body.password);
    if (!email || !password)
      return res.status(401).json({ error: "Invalid email or password" });

    const user = await User.findByEmail(email);
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    // Account without a password (made with, or taken back through, Google)
    if (!user.password) {
      return res.status(401).json({
        error: "This account signs in with Google. Use \"Continue with Google\", or \"Forgot password\" to set a password.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid email or password" });

    // Check if email is verified (only for local auth — social users are auto-verified)
    if (user.authProvider === "local" && !user.isEmailVerified) {
      return res.status(403).json({
        error: "Please verify your email before logging in. Check your inbox for the verification link.",
        needsVerification: true,
        email: user.email,
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      isAdmin: user.isAdmin,
      isEmailVerified: user.isEmailVerified,
      token: generateToken(user),
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

/**
 * @route   GET /api/auth/verify-email/:token
 * @desc    Verify email address using token from email
 */
router.get("/verify-email/:token", async (req, res) => {
  try {
    // Hash the token from the URL to compare with DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification link. Please request a new one." });
    }

    // Link for a changed address: switch to it now, if nobody took it meanwhile
    if (user.pendingEmail) {
      if (await User.findByEmail(user.pendingEmail, user._id)) {
        user.pendingEmail = undefined;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpire = undefined;
        await user.save({ validateBeforeSave: false });
        return res.status(400).json({ error: "That email address is now used by another account." });
      }
      user.email = user.pendingEmail;
      user.pendingEmail = undefined;
    }

    // Mark email as verified and clear the token
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    // Send welcome email
    try {
      await sendEmail({
        email: user.email,
        subject: "Welcome to Trustpilotafrica!",
        html: emailTemplates.welcomeEmail({ userName: user.name }),
      });
    } catch (emailErr) {
      console.error("Welcome email send error:", emailErr);
    }

    res.json({
      message: "Email verified successfully! You can now log in.",
      isEmailVerified: true,
    });
  } catch (err) {
    console.error("Verify email error:", err);
    sendServerError(res, err);
  }
});

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend the verification email
 */
router.post("/resend-verification", async (req, res) => {
  try {
    // Plain-text email only (see asText)
    const email = asText(req.body.email);

    const user = email ? await User.findByEmail(email) : null;

    // Don't reveal whether the email exists
    if (!user || user.isEmailVerified) {
      return res.json({
        message: "If that email is registered and unverified, a new verification link has been sent.",
      });
    }

    // Generate a new verification token
    const verifyToken = user.getEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${getClientUrl()}/verify-email/${verifyToken}`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Trustpilotafrica - Verify Your Email",
        html: emailTemplates.emailVerification({
          userName: user.name,
          verifyUrl,
        }),
      });
    } catch (emailErr) {
      console.error("Resend verification email error:", emailErr);
      return res.status(500).json({
        error: "Could not send verification email. Please try again later.",
      });
    }

    res.json({
      message: "If that email is registered and unverified, a new verification link has been sent.",
    });
  } catch (err) {
    console.error("Resend verification error:", err);
    sendServerError(res, err);
  }
});

/**
 * @route   GET /api/auth/me
 */
router.get("/me", protect, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    profileImage: req.user.profileImage,
    isAdmin: req.user.isAdmin,
    isEmailVerified: req.user.isEmailVerified,
  });
});

/**
 * @route   PUT /api/auth/me
 */
router.put("/me", protect, async (req, res) => {
  try {
    // Full account, including the password hash (protect leaves it out)
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Name: optional, plain text, up to 100 characters
    if (req.body.name !== undefined) {
      const name = asText(req.body.name);
      if (!name || name.length > 100) {
        return res.status(400).json({ error: "Name must be 1 to 100 characters" });
      }
      user.name = name;
    }

    // Profile picture: a web image link, or "" to remove it
    if (req.body.profileImage !== undefined) {
      const profileImage = asText(req.body.profileImage);
      if (profileImage && !/^https?:\/\//i.test(profileImage)) {
        return res.status(400).json({ error: "Profile image must be a web link" });
      }
      user.profileImage = profileImage;
    }

    // Changing the email or password needs the current password, so a stolen
    // login token alone can't take the account over
    const newEmail = asText(req.body.email);
    const emailChanged = Boolean(newEmail) && newEmail.toLowerCase() !== user.email.toLowerCase();
    const newPassword = asPassword(req.body.password);
    if (emailChanged || newPassword) {
      // Accounts made with Google have no password: they set one by email instead
      if (!user.password) {
        return res.status(400).json({
          error: "Your account has no password yet. Use \"Forgot password\" on the login page to set one first.",
        });
      }
      const currentPassword = asPassword(req.body.currentPassword);
      // 400, not 401: the login itself is fine, so the site must not log the user out
      if (!currentPassword || !(await user.matchPassword(currentPassword))) {
        return res.status(400).json({ error: "Your current password is incorrect", field: "currentPassword" });
      }
    }

    // New email: must be valid and free. It only replaces the current one
    // after its verification link is clicked, so a typo can't lock anyone out
    let verifyToken = null;
    if (emailChanged) {
      if (!isValidEmail(newEmail)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      if (await User.findByEmail(newEmail, user._id)) {
        return res.status(400).json({ error: "That email is already used by another account" });
      }
      user.pendingEmail = newEmail;
      // Link to prove the new address belongs to this user
      verifyToken = user.getEmailVerificationToken();
    }

    // New password: same rule as sign-up, and sign out every other device
    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }
      user.password = newPassword;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    const updatedUser = await user.save();

    // Send the verification link for a new email (failure is logged, not fatal:
    // they can ask for a new link from the login page)
    if (verifyToken) {
      try {
        await sendEmail({
          // Sent to the NEW address: clicking it proves the user owns it
          email: updatedUser.pendingEmail,
          subject: "Trustpilotafrica - Verify Your Email",
          html: emailTemplates.emailVerification({
            userName: updatedUser.name,
            verifyUrl: `${getClientUrl()}/verify-email/${verifyToken}`,
          }),
        });
      } catch (emailErr) {
        console.error("Email-change verification send error:", emailErr.message);
      }
    }

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      profileImage: updatedUser.profileImage,
      isAdmin: updatedUser.isAdmin,
      isEmailVerified: updatedUser.isEmailVerified,
      // Fresh token: after a password change the old one no longer works
      token: generateToken(updatedUser),
      ...(verifyToken && {
        message: `We sent a link to ${updatedUser.pendingEmail}. Your email changes once you click it.`,
      }),
    });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: "Could not update your profile" });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send reset email with token
 */
router.post("/forgot-password", async (req, res) => {
  try {
    // Plain-text email only (see asText)
    const email = asText(req.body.email);

    const user = email ? await User.findByEmail(email) : null;
    if (!user) {
      // Don't reveal whether email exists
      return res.json({
        message:
          "If an account with that email exists, a reset link has been sent.",
      });
    }

    // Generate reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Build reset URL — uses CLIENT_URL env var, defaults to production
    const resetUrl = `${getClientUrl()}/reset-password/${resetToken}`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Trustpilotafrica - Password Reset",
        html: emailTemplates.passwordReset({
          userName: user.name,
          resetUrl,
        }),
      });
    } catch (emailErr) {
      // If email fails, clear the token so it's not stuck
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error("Email send error:", emailErr);
      return res.status(500).json({
        error: "Could not send reset email. Please try again later.",
      });
    }

    res.json({
      message:
        "If an account with that email exists, a reset link has been sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    sendServerError(res, err);
  }
});

/**
 * @route   PUT /api/auth/reset-password/:token
 * @desc    Reset password using token from email
 */
router.put("/reset-password/:token", async (req, res) => {
  try {
    // Plain-text password only
    const password = asPassword(req.body.password);

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    // Hash the token from the URL to compare with DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid or expired reset token" });
    }

    // Set new password and clear reset fields
    user.password = password;
    // Sign out every device: old tokens (maybe stolen) stop working
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    // Also verify email if they reset their password (they proved they own the email)
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
    }

    await user.save();

    res.json({ message: "Password reset successful. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    sendServerError(res, err);
  }
});

// ======================
// SOCIAL AUTH ROUTES
// ======================

/**
 * @route   POST /api/auth/google
 * @desc    Sign in or sign up with Google
 * @body    { credential } — the ID token from Google's sign-in popup
 */
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      console.error("Google sign-in error: GOOGLE_CLIENT_ID is not set");
      return res.status(500).json({ error: "Google sign-in is not configured" });
    }

    let googleUser;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      googleUser = ticket.getPayload();
    } catch (err) {
      // Logged so outages (e.g. fetching Google's signing certs) are visible.
      // Only the reason before the first ":" is logged; the library appends
      // the raw token or its payload (with the user's email) after it.
      console.warn("Google token verification failed:", String(err.message).split(":")[0]);
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const { sub: googleId, email, email_verified: emailVerified, name, picture } = googleUser || {};

    // Only trust emails Google has verified; otherwise anyone could claim an
    // address and be linked to an existing account with that email.
    if (!googleId || !email || emailVerified !== true) {
      return res.status(401).json({ error: "Your Google email address is not verified" });
    }

    // The account already linked to this Google account wins; otherwise
    // look for an account using the same email address
    let user = (await User.findOne({ googleId })) || (await User.findByEmail(email));

    if (user) {
      if (!user.googleId) {
        // An account with this email whose owner never proved the address:
        // anyone could have registered it (e.g. to sit in wait for the real
        // owner). Google has now proved who owns the email, so take the account
        // back for them: drop the unknown password and sign out every device.
        if (!user.isEmailVerified) {
          // Whatever the unknown registrant set up goes: their name, photo,
          // pending email change and business claims
          user.name = name || email.split("@")[0];
          user.profileImage = picture || "";
          user.pendingEmail = undefined;
          await CompanyClaim.deleteMany({ user: user._id });
          user.password = undefined;
          user.isEmailVerified = true;
          user.emailVerificationToken = undefined;
          user.emailVerificationExpire = undefined;
          user.resetPasswordToken = undefined;
          user.resetPasswordExpire = undefined;
          user.tokenVersion = (user.tokenVersion || 0) + 1;
        }
        user.googleId = googleId;
        if (picture && hasNoRealProfileImage(user)) {
          user.profileImage = picture;
        }
        await user.save({ validateBeforeSave: false });
      }
    } else {
      // Social auth users are auto-verified (Google already verified their email)
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        googleId,
        profileImage: picture || "",
        authProvider: "google",
        isEmailVerified: true,
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      isAdmin: user.isAdmin,
      isEmailVerified: user.isEmailVerified,
      token: generateToken(user),
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// Facebook and Twitter sign-in were removed: the site never used them, and
// their token checks could be abused to log in as other users.

// ======================
// ADMIN MANAGEMENT
// ======================

/**
 * @route   PUT /api/auth/make-admin
 * @desc    Promote a user to admin (requires ADMIN_SECRET in body)
 * @body    { email, adminSecret }
 */
router.put("/make-admin", async (req, res) => {
  try {
    // Plain-text values only (see asText)
    const email = asText(req.body.email);
    const adminSecret = req.body.adminSecret;

    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Invalid admin secret" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.isAdmin = true;
    await user.save({ validateBeforeSave: false });

    res.json({
      message: `${user.name} (${user.email}) is now an admin`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error("Make admin error:", err);
    sendServerError(res, err);
  }
});



// ======================
// BUSINESS REGISTRATION
// ======================

/**
 * @route   POST /api/auth/register-business
 * @desc    Register a new user AND auto-create a pending CompanyClaim
 * @body    { name, email, password, companyName, companyUrl, role, jobTitle, reason }
 */


router.post("/register-business", async (req, res) => {
  try {
    // Plain-text values only (see asText)
    const name = asText(req.body.name);
    const email = asText(req.body.email);
    const password = asPassword(req.body.password);
    const companyName = asText(req.body.companyName);
    // Company website, only used if a new company is created: a real web
    // link, or nothing ("javascript:" and junk are dropped, never saved).
    // Not an error, because claiming an existing company never uses it.
    const companyUrl = normalizeHttpUrl(req.body.companyUrl) || "";
    const role = asText(req.body.role);
    const jobTitle = asText(req.body.jobTitle);
    const reason = asText(req.body.reason);
    // Company picked on its page ("Claim this business"); preferred over the name
    const claimCompanyId = asText(req.body.claimCompanyId);

    // --- Validate required fields ---
    if (!name || !email || !password || !companyName) {
      return res.status(400).json({
        error: "Name, email, password, and company name are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long"
      });
    }

    // --- Validate business email (block free email providers) ---
    const blockedDomains = [
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
      "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
      "live.com", "msn.com", "me.com", "inbox.com", "gmx.com",
      "yahoo.co.uk", "yahoo.co.in", "hotmail.co.uk", "rocketmail.com",
      "rediffmail.com", "fastmail.com", "tutanota.com",
    ];
    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (blockedDomains.includes(emailDomain)) {
      return res.status(400).json({
        error: "Please use your company email address. Free email providers are not accepted for business registration."
      });
    }

    // --- Check if user already exists ---
    const userExists = await User.findByEmail(email);
    if (userExists) {
      return res.status(400).json({ error: "Email already registered. Please login and claim your company from its page." });
    }

    // --- Step 1: Create the user account ---
    const user = await User.create({
      name,
      email,
      password,
      authProvider: "local",
      // Business users also need email verification
      isEmailVerified: false,
    });

    // Send verification email for business users too
    const verifyToken = user.getEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${getClientUrl()}/verify-email/${verifyToken}`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Trustpilotafrica - Verify Your Email",
        html: emailTemplates.emailVerification({
          userName: user.name,
          verifyUrl,
        }),
      });
    } catch (emailErr) {
      console.error("Business verification email send error:", emailErr);
    }

    // --- Step 2: Find or create the company ---
    // The exact company the user clicked "Claim" on, when given. Several
    // branches can share a name, so the name alone may pick the wrong one.
    let company = null;
    if (claimCompanyId && mongoose.Types.ObjectId.isValid(claimCompanyId)) {
      company = await Company.findById(claimCompanyId);
    }
    // Otherwise match by name (exact, case-insensitive, regex characters escaped)
    if (!company) {
      company = await Company.findOne({ name: exactTextFilter(companyName) });
    }

    if (!company) {
      company = await Company.create({
        name: companyName.trim(),
        url: companyUrl,
        source: "user",
      });
    }

    // --- Step 3: Create a pending claim ---
    const claim = await CompanyClaim.create({
      user: user._id,
      company: company._id,
      role: role || "owner",
      jobTitle: jobTitle ? jobTitle.trim() : "",
      reason: reason ? reason.trim() : `Registered as business representative for ${companyName}`,
      status: "pending",
    });

    // --- Step 4: Return user data + token ---
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      isAdmin: user.isAdmin,
      isEmailVerified: false,
      token: generateToken(user),
      message: "Account created! Please check your email to verify your account.",
      businessRegistration: {
        companyName: company.name,
        companyId: company._id,
        claimId: claim._id,
        claimStatus: "pending",
      },
    });
  } catch (err) {
    console.error("Business registration error:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        error: "A claim for this company already exists for this user."
      });
    }

    sendServerError(res, err);
  }
});

module.exports = router;
