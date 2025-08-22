import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import dotenv from 'dotenv';
import favicon from 'serve-favicon';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import cors from 'cors';




dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
try { app.use(favicon(path.join(__dirname, 'public','icons','icon-192.png'))); } catch(e){}


app.get('/', (req, res) => {
res.render('layout', { appName: 'Music PWA', title: "SLP", content: "index" });
});

app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if(!q) return res.status(400).json({ error: 'Query missing' });

  try {
    const r = await yts(q);
    // sadece ilk 10 videoyu al
    const results = r.videos.slice(0,10).map(v=>({
      title: v.title,
      url: v.url,
      duration: v.timestamp,
      thumbnail: v.image,
      author: v.author.name
    }));
    res.json({ results });
  } catch(e){
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/yt-stream', async (req, res) => {
  const { url } = req.query;
  if (!url || !ytdl.validateURL(url)) return res.status(400).json({ error: 'Geçersiz URL' });

  try {
    const info = await ytdl.getInfo(url);
    // Yalnızca audio formatlarını al
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
    if (!format || !format.url) return res.status(500).json({ error: 'Stream bulunamadı' });

    // JSON ile frontende URL gönder
    res.json({ streamUrl: format.url, title: info.videoDetails.title, artist: info.videoDetails.author.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stream alınamadı' });
  }
});


app.get('/health', (req, res) => res.json({ ok: true }));


app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
