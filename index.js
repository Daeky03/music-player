import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import dotenv from 'dotenv';
import favicon from 'serve-favicon';
import yts from 'yt-search';
import * as play from 'play-dl';
import cors from 'cors';
import axios from "axios";
import { Innertube, UniversalCache, Utils } from 'youtubei.js';
import ytdl from '@distube/ytdl-core';
import fetch from "node-fetch";
import vm from "vm";
import qs from "querystring";
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipe = promisify(pipeline);

// youtube-decipher.js
const DECIPHER_FUNC_NAME = "DisTubeDecipherFunc";
const N_TRANSFORM_FUNC_NAME = "DisTubeNTransformFunc";

// Aynı Python’daki regexler burada
const VARIABLE_PART = /[a-zA-Z_\$][a-zA-Z_0-9\$]*/.source;


const DECIPHER_REGEXP =
  /\b([a-zA-Z0-9$]{2})\s*=\s*function\(a\)\{\s*a=a\.split\(""\);.*?return a\.join\(""\)\}/s;

const DECIPHER_ARROW_REGEXP =
  /\b([a-zA-Z0-9$]{2})\s*=\s*\(a\)\s*=>\s*\{\s*a=a\.split\(""\);.*?return a\.join\(""\)\}/s;


const HELPER_REGEXP = new RegExp(
  `var (${VARIABLE_PART})=\\{((?:.*?))\\};`, "s"
);



// Fonksiyon çıkartma
function extractDecipherFunc(jsCode) {
  const helperMatch = jsCode.match(HELPER_REGEXP);
  if (!helperMatch) throw new Error("Helper not found");
  const helperObject = helperMatch[0];
console.log(helperObject);

  let match = jsCode.match(DECIPHER_REGEXP);
if (!match) match = jsCode.match(DECIPHER_ARROW_REGEXP);

if (match) {
  console.log("Decipher function found:", match[1]);
} else {
  console.log("No decipher function found");
}
  
  const decipherFunc = match[1];
  return `${helperObject};var ${DECIPHER_FUNC_NAME}=${decipherFunc};`;
}



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

const cookies = `VISITOR_PRIVACY_METADATA=CgJUUhIEGgAgUg%3D%3D;__Secure-3PSID=g.a0000gh--fY2NEEt839s7lEBOQmlD7c3bCunPDFx7cSNnuk_F6LDdA3BuM-Iicnv4Zl9zfgVBgACgYKAeISARUSFQHGX2Mii7oB97l-kLSuXuttsorLgxoVAUF8yKrtqKJtHrr0C9ki94R8xbNH0076;GPS=1;SIDCC=AKEyXzX92fMd688ADNBhmEh9mb5F2e71XdKW4-kou5DggqFpP0B-obz5cSvG7_BReAtJAZ1GlQ;YSC=cGQ9zgOCJbg;SID=g.a0000gh--fY2NEEt839s7lEBOQmlD7c3bCunPDFx7cSNnuk_F6LDhE5ty7UionRzN0sSsLYTSAACgYKASMSARUSFQHGX2Mi-RfnLgCR0zVgLUSjUjUS7RoVAUF8yKrLPBIQVyP9phSmln7r4oB00076;__Secure-1PSIDTS=sidts-CjUB5H03P7n_V0Yk3SVb_V9lED6bbld0pBJagHanH_ncCIeVGwLiXZcppA3E83tBulgs8-E9GBAA;SAPISID=K3JzDKARiNoERFCb/AAI1sh8xPfXRwOmFc;__Secure-1PSIDCC=AKEyXzVrSIXCyhPhOuRY5OCjTVvGRofFRWgtCdVfIxnnipBeO4b2J-e7vE5msLrtjsudHs2f;SSID=AkYPPMRnLdvH6JHbY;ST-1jr1dbr=csn=TehAXaotwvjZDA19&itct=CLkBEPxaIhMIw9KRj6ifjwMVgDLxBR3rvRPLMgpnLWhpZ2gtcmVjWg9GRXdoYXRfdG9fd2F0Y2iaAQYQjh4YngHKAQQr4YsZ;__Secure-1PAPISID=K3JzDKARiNoERFCb/AAI1sh8xPfXRwOmFc;__Secure-1PSID=g.a0000gh--fY2NEEt839s7lEBOQmlD7c3bCunPDFx7cSNnuk_F6LDjjEIK6nl6l9jWIUif7b74QACgYKAXYSARUSFQHGX2MiSlOLRzTblvjLid_eQ_AhVBoVAUF8yKqGkNjh0ZncyASbzy5G_DPB0076;__Secure-3PAPISID=K3JzDKARiNoERFCb/AAI1sh8xPfXRwOmFc;__Secure-3PSIDCC=AKEyXzXuafvn8Ro7ohymK4pyLq1nVU2VCxGf9c_Yw7IugTQsO85Qadj0Oo0NqC9DMxKgZ2nbyw;__Secure-3PSIDTS=sidts-CjUB5H03P7n_V0Yk3SVb_V9lED6bbld0pBJagHanH_ncCIeVGwLiXZcppA3E83tBulgs8-E9GBAA;APISID=uOZ24HyZpmKO1x6J/ALCBHyUZHW8RA7fHe;HSID=AhhwDZ8B8ONwaSDWW;LOGIN_INFO=AFmmF2swRAIgJwHIaTLdATeeira2DSeM0_T_W3y6O1im8vxQIuvuBtECIH0kxIQ5otHk0sdhXMHrEsLG0rzDxCKPzP6-5AqIhu-3:QUQ3MjNmemlSTWtMQzRpYVJUOXF4TnpNWHM5Mzk5aUwxYUd4SnJiR014d3JIY3JfQ05CRTNoeDh6R3QtcmNEMkRSWlRZTjByV0l4UmxUX3FnVFBGSG5ncHd0TDVQUzByQzVxYTBiVGpiQ3hvcktOa0I5c0x3Tm4yNWc4Yk5LRTlzUS1ldmpXb3JzcDRUNExKZl9nQXZETXVUSWtMSDRURUJzS0w4VnFJOGRyLXliRXBOR29idDl6Um5tdTBIM18tR253cERQV0g5cjN0cHhCRTh6a3ZmNHF0aFlHZDRBZnRKdw==;PREF=f6=40000000&tz=Europe.Istanbul&f5=30000&f7=100;ST-1fy5w0p=csn=Gkv_ULDr7KqQyQ27&itct=CH0Q_FoiEwiwoKD_p5-PAxV_eXoFHYwgDtwyCmctaGlnaC1yZWNaD0ZFd2hhdF90b193YXRjaJoBBhCOHhieAcoBBCvhixk%3D;ST-6edohc=csn=DLwQqZXrjHYAEWhy&itct=CFgQh_YEGAEiEwjg4b6Wz6OPAxV7eXoFHVr3M21aD0ZFd2hhdF90b193YXRjaJoBBQgkEI4eygEEK-GLGQ%3D%3D;ST-stt7tm=csn=Gkv_ULDr7KqQyQ27&itct=CHQQh_YEGAEiEwiwoKD_p5-PAxV_eXoFHYwgDtxaD0ZFd2hhdF90b193YXRjaJoBBQgkEI4eygEEK-GLGQ%3D%3D;VISITOR_INFO1_LIVE=qZTuqYA6BiM`;

await play.setToken({ youtube: { cookie: cookies } });


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


app.get('/stream/:videoId', async (req, res) => {
  try {
    const yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true, cookie: cookies, user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' });
    const videoId = req.params.videoId;

    // Audio stream alıyoruz
    const videoInfo = await yt.getInfo(videoId, { client: 'YTMUSIC' });

      console.log(videoInfo);

        const stream = await yt.getStreamingData(videoId, {
      type: 'audio', // audio, video or video+audio
      quality: 'best', // best, bestefficiency, 144p, 240p, 480p, 720p and so on.
      format: 'mp3', // media container format,
      codec: 'mp3',
          client: 'YTMUSIC'
    });

    
    // Streami direkt olarak yanıtla
   res.setHeader('Content-Type', 'audio/mp3');
    const response = await fetch(stream.url, { headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      'Cookie': cookies
    }
        });
    console.log(response.status);
    response.body.pipe(res);
    // Header ayarı
       // Streami gönderiyoruz

      
    
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});





app.get('/health', (req, res) => res.json({ ok: true }));


app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
