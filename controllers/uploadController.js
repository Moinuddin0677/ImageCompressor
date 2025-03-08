const multer = require("multer");
const csvParser = require("csv-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const path = require("path");
const Jimp = require("jimp");
const pool = require("../config/db");
const dotenv = require("dotenv");
const { Parser } = require("json2csv");

dotenv.config();

// Set up multer storage
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only CSV files are allowed."), false);
  }
};
const upload = multer({ storage, fileFilter });


const uploadCSV = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const requestId = uuidv4();
  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      try {


        if (results.length === 0) {
          return res.status(400).json({ error: "Empty CSV file uploaded" });
        }

        //Check if required columns exist
        const requiredColumns = ["Serial Number", "Product Name", "Input Image Urls"];
        const csvColumns = Object.keys(results[0]);

        for (const column of requiredColumns) {
          if (!csvColumns.includes(column)) {
            return res.status(400).json({ error: `Invalid CSV format. Missing column: ${column}` });
          }
        }


        await pool.query(
          "INSERT INTO requests (request_id, status) VALUES ($1, $2)",
          [requestId, "Processing"]
        );

        const filteredResults = results.filter(row => Object.keys(row).length > 0);

        for (const row of filteredResults) {
          const inputUrls = row["Input Image Urls"].split(",").map(url => url.trim());
          const outputImages = [];
          let flag = true;

          for (const url of inputUrls) {
            try {
              const response = await axios({ url, responseType: "arraybuffer" });
              const image = await Jimp.read(Buffer.from(response.data));
              image.quality(50);
              const fileName = `${uuidv4()}.jpg`;
              const outputPath = path.join(__dirname, "../public/compressed", fileName);

              await image.writeAsync(outputPath);
              
              // Store public URL instead of just file path
              const imageUrl = `${process.env.BASE_URL}/compressed/${fileName}`;
              outputImages.push(imageUrl);
            } catch (error) {
              flag = false;
              console.error(`Error processing image ${url}:`, error);
            }
          }

          if (flag) {
            await pool.query(
              "INSERT INTO images (request_id, input_url, output_url) VALUES ($1, $2, $3)",
              [requestId, row["Input Image Urls"], outputImages.join(",")]
            );
          }
        }

        await pool.query("UPDATE requests SET status = 'Completed' WHERE request_id = $1", [requestId]);

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

const exportCSV = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT request_id, input_url, output_url FROM images WHERE request_id = $1",
      [req.params.requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "No data available" });
    }

    // Convert JSON to CSV format
    const fields = ["request_id", "input_url", "output_url"];
    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment("output_images.csv");
    res.send(csvData);
  } catch (error) {
    console.error("Error exporting CSV:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  uploadCSV,
  getStatus,
  uploadMiddleware: upload.single("file"), // ✅ Ensure Multer is correctly used
  exportCSV,
};
