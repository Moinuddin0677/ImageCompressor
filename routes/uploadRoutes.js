// routes/uploadRoutes.js
const express = require("express");
const router = express.Router();
const { uploadCSV, getStatus, uploadMiddleware,exportCSV } = require("../controllers/uploadController");

router.post("/upload", uploadMiddleware, uploadCSV);
router.get("/status/:requestId", getStatus);
router.get("/export-csv/:requestId", exportCSV);


module.exports = router;
