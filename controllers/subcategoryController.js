const Subcategory = require("../models/SubCategory");

// @desc    Get subcategories for a category
// @route   GET /api/subcategories?categoryId=123
// @access  Public (frontend calls this when a category is clicked)
exports.getSubcategories = async (req, res) => {
  try {
    const { categoryId } = req.query;
    const query = categoryId ? { category: categoryId } : {}; // filter if categoryId provided
    const subcategories = await Subcategory.find(query).populate(
      "category",
      "name"
    );
    res.json(subcategories);
  } catch (error) {
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};

// @desc    Create a new subcategory (Admin only later)
// @route   POST /api/subcategories
exports.createSubcategory = async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    const subcategory = new Subcategory({ name, category: categoryId });
    await subcategory.save();
    res.status(201).json(subcategory);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
exports.deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findByIdAndDelete(req.params.id);
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }
    res.json({ message: "Subcategory deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
