// routes/uploadRoutes.js
const express = require("express");
const router = express.Router();
const { uploadCSV, getStatus, uploadMiddleware } = require("../controllers/uploadController");

router.post("/upload", uploadMiddleware, uploadCSV);
router.get("/status/:requestId", getStatus);

module.exports = router;
