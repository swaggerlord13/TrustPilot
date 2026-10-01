const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const sendEmail = require("../utils/sendEmail");
const emailTemplates = require("../utils/emailTemplates");
const router = express.Router();

// Google ID tokens are verified with Google's official library (checks the
// signature, expiry, issuer and that the token was issued for OUR client ID).
// Other social tokens are verified with native fetch (Node 18+).
const googleClient = new OAuth2Client();

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

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
    const { name, email, password, profileImage } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const user = await User.create({ name, email, password, profileImage });

    // Generate email verification token
    const verifyToken = user.getEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Build verification URL
    const verifyUrl = `${getClientUrl()}/verify-email/${verifyToken}`;

    // Send verification email
    try {
      await sendEmail({
        email: user.email,
        subject: "TrustPilot Africa - Verify Your Email",
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
      token: generateToken(user._id),
      message: "Account created! Please check your email to verify your account.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

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
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    // Mark email as verified and clear the token
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    // Send welcome email
    try {
      await sendEmail({
        email: user.email,
        subject: "Welcome to TrustPilot Africa!",
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend the verification email
 */
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

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
        subject: "TrustPilot Africa - Verify Your Email",
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
    res.status(500).json({ error: err.message });
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
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.profileImage = req.body.profileImage || user.profileImage;

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      profileImage: updatedUser.profileImage,
      isAdmin: updatedUser.isAdmin,
      isEmailVerified: updatedUser.isEmailVerified,
      token: generateToken(updatedUser._id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send reset email with token
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
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
        subject: "TrustPilot Africa - Password Reset",
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   PUT /api/auth/reset-password/:token
 * @desc    Reset password using token from email
 */
router.put("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
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
    res.status(500).json({ error: err.message });
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
    } catch {
      return res.status(401).json({ error: "Invalid Google token" });
    }

    const { sub: googleId, email, email_verified: emailVerified, name, picture } = googleUser || {};

    // Only trust emails Google has verified; otherwise anyone could claim an
    // address and be linked to an existing account with that email.
    if (!googleId || !email || emailVerified !== true) {
      return res.status(401).json({ error: "Your Google email address is not verified" });
    }

    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = user.authProvider === "local" ? "local" : user.authProvider;
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
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

/**
 * @route   POST /api/auth/facebook
 * @desc    Sign in or sign up with Facebook
 * @body    { accessToken, userID } — from Facebook's Login SDK
 */
router.post("/facebook", async (req, res) => {
  try {
    const { accessToken, userID } = req.body;

    if (!accessToken || !userID) {
      return res.status(400).json({ error: "Facebook access token and user ID are required" });
    }

    const fbRes = await fetch(
      `https://graph.facebook.com/${userID}?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
    );

    if (!fbRes.ok) {
      return res.status(401).json({ error: "Invalid Facebook token" });
    }

    const fbUser = await fbRes.json();

    if (fbUser.id !== userID) {
      return res.status(401).json({ error: "Facebook user ID mismatch" });
    }

    const facebookId = fbUser.id;
    const email = fbUser.email;
    const name = fbUser.name;
    const picture = fbUser.picture?.data?.url;

    if (!email) {
      return res.status(400).json({
        error: "Email permission is required. Please grant email access when logging in with Facebook.",
      });
    }

    let user = await User.findOne({
      $or: [{ facebookId }, { email }],
    });

    if (user) {
      if (!user.facebookId) {
        user.facebookId = facebookId;
        if (picture && hasNoRealProfileImage(user)) {
          user.profileImage = picture;
        }
        await user.save({ validateBeforeSave: false });
      }
    } else {
      user = await User.create({
        name,
        email,
        facebookId,
        profileImage: picture || "",
        authProvider: "facebook",
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
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("Facebook auth error:", err);
    res.status(500).json({ error: "Facebook authentication failed" });
  }
});

/**
 * @route   POST /api/auth/twitter
 * @desc    Sign in or sign up with Twitter/X
 * @body    { code, codeVerifier, redirectUri } — from Twitter OAuth 2.0 PKCE flow
 */
router.post("/twitter", async (req, res) => {
  try {
    const { code, codeVerifier, redirectUri } = req.body;

    if (!code || !codeVerifier || !redirectUri) {
      return res.status(400).json({ error: "Twitter auth code, verifier, and redirect URI are required" });
    }

    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "Twitter authentication is not configured" });
    }

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errData = await tokenRes.text();
      console.error("Twitter token exchange failed:", errData);
      return res.status(401).json({ error: "Failed to verify Twitter credentials" });
    }

    const tokenData = await tokenRes.json();

    const userRes = await fetch("https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: "Could not fetch Twitter profile" });
    }

    const { data: twitterUser } = await userRes.json();
    const twitterId = twitterUser.id;
    const name = twitterUser.name;
    const username = twitterUser.username;
    const picture = twitterUser.profile_image_url?.replace("_normal", "_400x400");

    const email = `${username}@twitter.trustpilotafrica.com`;

    let user = await User.findOne({
      $or: [{ twitterId }, { email }],
    });

    if (user) {
      if (!user.twitterId) {
        user.twitterId = twitterId;
        if (picture && hasNoRealProfileImage(user)) {
          user.profileImage = picture;
        }
        await user.save({ validateBeforeSave: false });
      }
    } else {
      user = await User.create({
        name,
        email,
        twitterId,
        profileImage: picture || "",
        authProvider: "twitter",
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
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error("Twitter auth error:", err);
    res.status(500).json({ error: "Twitter authentication failed" });
  }
});


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
    const { email, adminSecret } = req.body;

    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: "Invalid admin secret" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email });
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
    res.status(500).json({ error: err.message });
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
const Company = require("../models/Company");
const CompanyClaim = require("../models/CompanyClaim");

router.post("/register-business", async (req, res) => {
  try {
    const { name, email, password, companyName, companyUrl, role, jobTitle, reason } = req.body;

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
    const userExists = await User.findOne({ email });
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
        subject: "TrustPilot Africa - Verify Your Email",
        html: emailTemplates.emailVerification({
          userName: user.name,
          verifyUrl,
        }),
      });
    } catch (emailErr) {
      console.error("Business verification email send error:", emailErr);
    }

    // --- Step 2: Find or create the company ---
    const escapedName = companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let company = await Company.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") }
    });

    if (!company) {
      company = await Company.create({
        name: companyName.trim(),
        url: companyUrl ? companyUrl.trim() : "",
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
      token: generateToken(user._id),
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

    res.status(500).json({ error: err.message || "Server error. Please try again later." });
  }
});

module.exports = router;
