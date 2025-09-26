// server.js — Optimisé pour Render.com avec Resend
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend'); // ✅ Resend au lieu de Nodemailer

const app = express();
const PORT = process.env.PORT || 5000;

// Initialiser Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ CORS simplifié
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

    // HTML
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #eee; background: #f9f9f9;">
        <div style="background: #002147; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🚢 NOUVELLE CANDIDATURE MARIN</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #0056b3;">📋 Informations du Candidat</h2>
          <p><strong>Nom:</strong> ${prenom} ${nom}</p>
          <p><strong>Nationalité:</strong> ${nationalite}</p>
          <p><strong>Situation:</strong> ${situation_matrimoniale || 'Non spécifiée'}</p>
          <p><strong>Âge:</strong> ${age || 'Non spécifié'} ans</p>
          <p><strong>Téléphone:</strong> ${telephone || 'Non spécifié'}</p>
          <p><strong>Poste:</strong> ${metier || 'Non spécifié'}</p>
          ${photoCid ? `<img src="cid:${photoCid}" alt="Photo" style="max-width: 300px; margin: 20px 0; border-radius: 8px;">` : ''}
          ${telephone && telephone.trim() ? `
            <div style="margin: 25px 0; text-align: center;">
              <a href="tel:${encodeURIComponent(fullInternationalNumber)}" 
                 style="display: inline-block; background: #27ae60; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                📞 Appeler
              </a>
              <a href="https://wa.me/${cleanPhone}" 
                 target="_blank"
                 style="display: inline-block; background: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 0 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                💬 WhatsApp
              </a>
            </div>
          ` : ''}
          <p><em>Envoyé le ${new Date().toLocaleString('fr-FR')}</em></p>
        </div>
      </div>
    `;

    // 🔁 Convertir les fichiers en base64 pour Resend
    const attachmentsForResend = attachments.map(file => ({
      filename: path.basename(file.path),
      content: fs.readFileSync(file.path, { encoding: 'base64' }),
    }));

    // ✅ Envoi via Resend
    const { data, error } = await resend.emails.send({
      from: 'Recrutement ICS-benin <onboarding@resend.dev>', // ✅ Autorisé sans vérification
      to: process.env.EMAIL_TO || 'icsbenin01@gmail.com',
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
    console.log('✅ Email envoyé avec succès via Resend');
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
  console.log(`📨 Envoi vers: ${process.env.EMAIL_TO || 'icsbenin01@gmail.com'}`);
console.log(`📨 Envoi vers: 11111111111111111111111111`);

});