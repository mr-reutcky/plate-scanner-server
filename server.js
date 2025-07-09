// Import necessary modules
const express = require("express");
require("dotenv").config();
const bodyParser = require("body-parser");
const AWS = require("aws-sdk");
const cors = require("cors");

const app = express();

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse JSON request bodies with a 10MB limit
app.use(bodyParser.json({ limit: "10mb" }));

// Configure AWS SDK with credentials and region from environment variables
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

// Create a new Rekognition client
const rekognition = new AWS.Rekognition();

// Define the POST endpoint for license plate detection
app.post("/api/detect-plate", async (req, res) => {
  const { image } = req.body;

  // Return error if no image is provided
  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  // Remove the Base64 header and decode the image
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Prepare Rekognition request parameters
  const params = {
    Image: { Bytes: buffer },
  };

  try {
    // Send image to AWS Rekognition for text detection
    const data = await rekognition.detectText(params).promise();
    const detections = data.TextDetections || [];

    // Filter detected text lines: must be uppercase letters/numbers/spaces and at least 3 characters long
    const lines = detections
      .filter(d =>
        d.Type === "LINE" &&
        d.DetectedText.length >= 3 &&
        /^[A-Z0-9 ]+$/.test(d.DetectedText)
      )
      .map(d => d.DetectedText.trim());

    console.log("Detected lines:", lines);

    // Check for standard single-line plate format: 3 characters + space + 3 characters (e.g. ABC 123)
    const singleLineMatch = lines.find(line =>
      /^[A-Z0-9]{3} [A-Z0-9]{3}$/.test(line)
    );

    if (singleLineMatch) {
      console.log("Matched single line format:", singleLineMatch);
      return res.json({ plate: singleLineMatch });
    }

    // Check for two-line plate format: two consecutive lines of 3 characters each (e.g. ABC\n123)
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

    // Fallback match: any alphanumeric text 5-8 characters long, but not purely numeric
    const fallback = lines.find(line =>
      /^[A-Z0-9]{5,8}$/.test(line) &&
      !/^[0-9]+$/.test(line)
    );

    if (fallback) {
      console.log("Matched fallback plate:", fallback);
      return res.json({ plate: fallback });
    }

    // No plate match found
    res.json({ plate: null });

  } catch (err) {
    // Handle AWS Rekognition errors
    console.error(err);
    res.status(500).json({ error: "AWS Rekognition failed" });
  }
});

// Start the Express server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
