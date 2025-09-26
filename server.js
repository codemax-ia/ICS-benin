// server.js — Optimisé pour Render.com avec Resend + design pro
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialiser Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ CORS
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Dossier uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${uuidv4().substring(0, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photo' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('La photo doit être une image'), false);
    }
    if ((file.fieldname === 'cv' || file.fieldname === 'certificats') && file.mimetype !== 'application/pdf') {
      return cb(new Error('Les documents doivent être en PDF'), false);
    }
    cb(null, true);
  }
});

// Route principale
app.post('/api/send-application', upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'certificats', maxCount: 5 }
]), async (req, res) => {
  console.log('📩 Nouvelle candidature reçue');

  try {
    const {
      nom = '',
      prenom = '',
      nationalite = '',
      situation_matrimoniale = '',
      age = '',
      telephone = '',
      metier = ''
    } = req.body;

    if (!nom.trim() || !prenom.trim() || !metier.trim()) {
      cleanupFiles(req);
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    // Préparer pièces jointes
    const attachments = [];
    let photoCid = null;

    if (req.files['photo']?.[0]) {
      const photoFile = req.files['photo'][0];
      photoCid = 'photo@application';
      attachments.push({
        filename: `photo_${prenom}_${nom}${path.extname(photoFile.originalname)}`,
        path: photoFile.path,
        cid: photoCid
      });
    }

    if (req.files['cv']?.[0]) {
      const cvFile = req.files['cv'][0];
      attachments.push({
        filename: `cv_${prenom}_${nom}.pdf`,
        path: cvFile.path
      });
    }

    if (req.files['certificats']) {
      req.files['certificats'].forEach((file, index) => {
        attachments.push({
          filename: `certificat_${index + 1}_${prenom}_${nom}.pdf`,
          path: file.path
        });
      });
    }

    // Téléphone propre
    const cleanPhone = telephone ? telephone.replace(/\D/g, '') : '';
    const fullInternationalNumber = telephone?.startsWith('+') 
      ? telephone 
      : (cleanPhone ? `+${cleanPhone}` : '');

    // ✨ HTML PROFESSIONNEL
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        <div style="background: linear-gradient(135deg, #002147, #003f88); color: white; padding: 24px 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.5px;">🚢 NOUVELLE CANDIDATURE MARIN</h1>
        </div>
        <div style="padding: 30px; background: #fafafa;">
          <h2 style="color: #003a66; font-size: 18px; margin-top: 0; border-bottom: 2px solid #eaeaea; padding-bottom: 10px;">
            📋 Informations du Candidat
          </h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; font-size: 15px;">
            <div><strong>Nom complet :</strong> ${prenom} ${nom}</div>
            <div><strong>Nationalité :</strong> ${nationalite || '—'}</div>
            <div><strong>Âge :</strong> ${age || 'Non spécifié'} ans</div>
            <div><strong>Situation :</strong> ${situation_matrimoniale || 'Non spécifiée'}</div>
            <div><strong>Poste visé :</strong> ${metier || '—'}</div>
            <div><strong>Téléphone :</strong> ${telephone || '—'}</div>
          </div>
          ${photoCid ? `
            <div style="text-align: center; margin: 20px 0;">
              <div style="display: inline-block; border: 3px solid #e0e7ff; border-radius: 12px; padding: 4px; background: white;">
                <img src="cid:${photoCid}" alt="Photo du candidat" 
                     style="width: 180px; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); display: block;"
                     onerror="this.style.display='none'">
              </div>
              <p style="font-size: 13px; color: #666; margin-top: 8px; font-style: italic;">(Photo du candidat)</p>
            </div>
          ` : ''}
          ${telephone && telephone.trim() ? `
            <div style="text-align: center; margin: 25px 0;">
              <div style="display: inline-flex; gap: 16px; flex-wrap: wrap; justify-content: center;">
                <a href="tel:${encodeURIComponent(fullInternationalNumber)}" 
                   style="display: inline-block; background: #27ae60; color: white; text-decoration: none; padding: 12px 24px; border-radius: 50px; font-weight: 600; font-size: 15px; box-shadow: 0 3px 10px rgba(39, 174, 96, 0.3); min-width: 140px; text-align: center;">
                  📞 Appeler
                </a>
                <a href="https://wa.me/${cleanPhone}" 
                   target="_blank"
                   style="display: inline-block; background: #25D366; color: white; text-decoration: none; padding: 12px 24px; border-radius: 50px; font-weight: 600; font-size: 15px; box-shadow: 0 3px 10px rgba(37, 211, 102, 0.3); min-width: 140px; text-align: center;">
                  💬 WhatsApp
                </a>
              </div>
            </div>
          ` : ''}
          <div style="text-align: right; margin-top: 25px; padding-top: 15px; border-top: 1px dashed #ddd; color: #777; font-size: 13px;">
            <em>📩 Reçu le ${new Date().toLocaleString('fr-FR')}</em>
          </div>
        </div>
      </div>
    `;

    // Convertir pièces jointes en base64
    const attachmentsForResend = attachments.map(file => ({
      filename: path.basename(file.path),
      content: fs.readFileSync(file.path, { encoding: 'base64' }),
    }));

    // ✅ Envoi à icsbenin01@gmail.com (ton email Resend)
    const { data, error } = await resend.emails.send({
      from: 'Recrutement ICS-benin <onboarding@resend.dev>',
      to: 'icsbenin01@gmail.com',
      subject: `🚢 Candidature: ${prenom} ${nom} - ${metier}`,
      html: htmlContent,
      attachments: attachmentsForResend,
    });

    if (error) {
      console.error('❌ Erreur Resend:', error);
      cleanupFiles(req);
      return res.status(500).json({ success: false, message: 'Échec envoi email' });
    }

    cleanupFiles(req);
    console.log('✅ Email envoyé avec succès à icsbenin01@gmail.com');
    res.json({ success: true, message: 'Candidature envoyée !' });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    cleanupFiles(req);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Nettoyage
function cleanupFiles(req) {
  if (!req.files) return;
  Object.values(req.files).flat().forEach(file => {
    fs.unlink(file.path, err => {
      if (err) console.log('⚠️ Erreur nettoyage:', file.path);
    });
  });
}

// Route santé
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Serveur en ligne ✅' });
});

// Gestion erreurs
app.use((error, req, res, next) => {
  cleanupFiles(req);
  res.status(400).json({ success: false, message: error.message });
});

// Démarrage
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📨 Emails envoyés à : icsbenin01@gmail.com`);
});