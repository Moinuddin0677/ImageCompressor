// controllers/uploadController.js
const multer = require("multer");
const csvParser = require("csv-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");
const pool = require("../config/db");
const dotenv = require("dotenv");

dotenv.config();

// Set up multer storage
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage });

// Upload handler
const uploadCSV = (req, res) => {
  const requestId = uuidv4();
  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      try {
        // Insert the overall request record
        await pool.query(
          "INSERT INTO requests (request_id, status) VALUES ($1, $2)",
          [requestId, "Processing"]
        );

        // Filter out empty rows
        const filteredResults = results.filter((row) => Object.keys(row).length > 0);
        // Process each CSV row
        for (const row of filteredResults) {
          // Expect the Input Image Urls column to be a comma-separated string
          const inputUrls = row["Input Image Urls"].split(",").map(url => url.trim());
          // Array to hold output image paths for this row
          const outputImages = [];
          let flag = true;

          // Process each image URL
          for (const url of inputUrls) {
            try {
              const response = await axios({ url, responseType: "arraybuffer" });
              const image = await Jimp.read(Buffer.from(response.data));
              image.quality(50);
              const outputPath = `${uuidv4()}/output.jpg`;
              await image.writeAsync(outputPath);
              outputImages.push(outputPath);
            } catch (error) {
              flag = false;
              console.error(`Error processing image ${url}:`, error);
            }
          }

          // If all images processed successfully, insert a row into images table
          if (flag) {
            const outputImagesString = outputImages.join(",");
            await pool.query(
              "INSERT INTO images (request_id, input_url, output_url) VALUES ($1, $2, $3)",
              [requestId, row["Input Image Urls"], outputImagesString]
            );
          }
        }

        // Update request status to Completed
        await pool.query("UPDATE requests SET status = 'Completed' WHERE request_id = $1", [requestId]);

        // Trigger webhook if defined
        if (process.env.WEBHOOK_URL) {
          try {
            await axios.post(process.env.WEBHOOK_URL, { requestId, status: "Completed" });
          } catch (webhookError) {
            console.error("Error while triggering webhook:", webhookError);
          }
        }

        res.json({ requestId });
      } catch (err) {
        console.error("Error processing CSV:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });
};

// Status handler
const getStatus = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT request_id, status FROM requests WHERE request_id = $1",
      [req.params.requestId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Request not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  uploadCSV,
  getStatus,
  uploadMiddleware: upload.single("file")
};
