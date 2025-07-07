const express = require("express");
require("dotenv").config();
const bodyParser = require("body-parser");
const AWS = require("aws-sdk");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const rekognition = new AWS.Rekognition();

app.post("/api/detect-plate", async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const params = {
    Image: { Bytes: buffer },
  };

  try {
    const data = await rekognition.detectText(params).promise();
    const detections = data.TextDetections || [];

    const lines = detections
      .filter(d =>
        d.Type === "LINE" &&
        d.DetectedText.length >= 3 &&
        /^[A-Z0-9 ]+$/.test(d.DetectedText)
      )
      .map(d => d.DetectedText.trim());

    console.log("Detected lines:", lines);

    const singleLineMatch = lines.find(line =>
      /^[A-Z0-9]{3} [A-Z0-9]{3}$/.test(line)
    );

    if (singleLineMatch) {
      console.log("Matched single line format:", singleLineMatch);
      return res.json({ plate: singleLineMatch });
    }

    let twoLineMatch = null;
    for (let i = 0; i < lines.length - 1; i++) {
      if (
        /^[A-Z0-9]{3}$/.test(lines[i]) &&
        /^[A-Z0-9]{3}$/.test(lines[i + 1])
      ) {
        twoLineMatch = `${lines[i]} ${lines[i + 1]}`;
        console.log("Matched two-line format:", twoLineMatch);
        break;
      }
    }

    if (twoLineMatch) {
      return res.json({ plate: twoLineMatch });
    }

    const fallback = lines.find(line =>
      /^[A-Z0-9]{5,8}$/.test(line) &&
      !/^[0-9]+$/.test(line)
    );

    if (fallback) {
      console.log("Matched fallback plate:", fallback);
      return res.json({ plate: fallback });
    }

    res.json({ plate: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AWS Rekognition failed" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
