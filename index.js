// index.js
const express = require("express");
const app = express();
const uploadRoutes = require("./routes/uploadRoutes");
const dotenv = require("dotenv");

dotenv.config();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/", uploadRoutes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
