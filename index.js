const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const uploadRoutes = require("./routes/uploadRoutes");

const PORT = process.env.PORT || 3000;

// ✅ Ensure static files are served from "public/compressed"
app.use("/compressed", express.static(path.join(__dirname, "public/compressed")));

app.use("/", uploadRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
