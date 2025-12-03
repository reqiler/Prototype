// server.js (CommonJS)

require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- CONFIG UPLOAD → pic.in.th -------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const PIC_API_URL = 'https://pic.in.th/api/1/upload';
const PIC_API_KEY = process.env.PIC_API_KEY; // เก็บคีย์ใน .env

if (!PIC_API_KEY) {
  console.warn('Warning: PIC_API_KEY not set. Set it in .env before running server.');
}

/* -------------------- MIDDLEWARE ทั่วไป -------------------- */

// อ่านข้อมูลจาก form (urlencoded) สำหรับฟอร์มส่งเมล
app.use(express.urlencoded({ extended: true }));
// ถ้าเผื่อมีการส่ง JSON ในอนาคต
app.use(express.json());

// เสิร์ฟไฟล์ static ในโฟลเดอร์ public (index.html, upload.html, mail.html)
app.use(express.static(path.join(__dirname, 'public')));

/* -------------------- ROUTE หน้าแรก -------------------- */

// GET / -> หน้าเลือกเมนู (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* -------------------- ROUTE อัปโหลดรูป /upload -------------------- */

// POST /upload => รับไฟล์จาก client แล้ว forward ให้ pic.in.th
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });

    // สร้าง form-data สำหรับส่งไป pic.in.th
    const fd = new FormData();

    // pic.in.th accepts "source" (file binary) and "format=json"
    fd.append('source', req.file.buffer, {
      filename: req.file.originalname || 'upload.bin',
      contentType: req.file.mimetype || 'application/octet-stream',
      knownLength: req.file.size,
    });
    fd.append('format', 'json');

    if (PIC_API_KEY) {
      // ส่งเป็นฟิลด์ 'key' เพื่อเลี่ยง custom header preflight
      fd.append('key', PIC_API_KEY);
    }

    const headers = fd.getHeaders();

    const upstream = await axios.post(PIC_API_URL, fd, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: null, // ให้เราตรวจ status code เอง
    });

    // ส่ง response กลับไปให้ client ตามที่ pic.in.th ตอบมา
    res.status(upstream.status).json(upstream.data);
  } catch (err) {
    console.error('Upload proxy error:', err && err.stack ? err.stack : err);
    res.status(500).json({
      error: 'proxy_error',
      detail: err && err.message ? err.message : String(err),
    });
  }
});

/* -------------------- ROUTE ส่งเมล /send-mail -------------------- */

// POST /send-mail -> รับข้อมูลจากฟอร์มแล้วส่งเมล
app.post('/send-mail', async (req, res) => {
  const { to, subject, message } = req.body;

  // สร้าง transporter สำหรับส่งเมล
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // ใช้ true กับ port 465
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Web Mailer" <${process.env.MAIL_USER}>`,
    to,
    subject,
    text: message,
    // ถ้าอยากส่งเป็น HTML:
    // html: `<p>${message}</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.send(`
      <h2>ส่งเมลสำเร็จ!</h2>
      <p>ส่งไปที่: ${to}</p>
      <a href="/">กลับหน้าหลัก</a>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <h2>เกิดข้อผิดพลาดในการส่งเมล</h2>
      <pre>${error.message}</pre>
      <a href="/">ลองใหม่ / กลับหน้าหลัก</a>
    `);
  }
});

/* -------------------- START SERVER -------------------- */

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
