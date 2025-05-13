// backend/api/analyze.js
const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  console.log('Request body:', req.body);
  
  const { url } = req.body;
  if (!url) {
    console.log('No URL provided in request body');
    return res.status(400).json({ error: 'URL is required in request body' });
  }

  console.log('Processing URL:', url);

  try {
    // Extract video ID using regex
    const videoIdMatch = url.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    
    console.log('Extracted video ID:', videoId);

    if (!videoId) {
      console.log('No video ID found in URL:', url);
      return res.status(400).json({ error: 'Invalid YouTube URL - no video ID found' });
    }

    // Use process.cwd() to get the current working directory
    const outputPath = path.join(process.cwd(), `${videoId}.en.vtt`);
    console.log('Output path:', outputPath);

    const ytDlpPath = '/opt/homebrew/bin/yt-dlp';
    const cmd = `${ytDlpPath} --write-auto-sub --sub-lang en --skip-download -o "${videoId}.%(ext)s" "${url}"`;

    console.log('Executing command:', cmd);

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        console.error(`stderr: ${stderr}`);
        return res.status(500).json({ error: 'Failed to download subtitles', details: error.message });
      }

      console.log('Command output:', stdout);

      // 2. read .vtt file and parse it
      try {
        // Wait a short moment to ensure file is written
        setTimeout(() => {
          try {
            if (!fs.existsSync(outputPath)) {
              console.log('Subtitle file not found at:', outputPath);
              return res.status(404).json({ error: 'Subtitle file not found' });
            }

            const transcript = fs.readFileSync(outputPath, 'utf8');
            
            // Clean up the file after reading
            fs.unlinkSync(outputPath);
            
            return res.status(200).json({ transcript });
          } catch (readError) {
            console.error(`File read error: ${readError}`);
            return res.status(500).json({ error: 'Failed to read subtitle file', details: readError.message });
          }
        }, 1000); // Wait 1 second to ensure file is written

      } catch (err) {
        console.error('Error in file handling:', err);
        return res.status(500).json({ error: 'Error handling subtitle file', details: err.message });
      }
    });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server Error', details: err.message });
  }
};
