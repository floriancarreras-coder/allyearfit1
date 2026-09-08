import express from "express";
import Stripe from "stripe";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const PORT = process.env.PORT || 3000;
const SUCCESS_URL = process.env.SUCCESS_URL || "https://www.kinqc.ca/merci";
const CANCEL_URL = process.env.CANCEL_URL || "https://www.kinqc.ca/#offer";

// -------------------------------------------------------------
// FONCTION SYNCHRONISATION SYSTEME.IO (Contact + Tag intelligent)
// -------------------------------------------------------------
async function synchroniserSystemeIO(email, prenom = "", nom = "") {
  const apiKey = process.env.SYSTEME_IO_API_KEY;
  const tagIdentifier = process.env.SYSTEME_IO_TAG_ID;

  if (!apiKey) {
    console.log("⚠️ SYSTEME_IO_API_KEY non configurée.");
    return;
  }

  try {
    let numericTagId = null;
    if (tagIdentifier) {
      if (!isNaN(tagIdentifier)) {
        numericTagId = Number(tagIdentifier);
      } else {
        console.log(`🔍 Recherche de l'ID numérique pour le tag "${tagIdentifier}"...`);
        const resTags = await fetch("https://api.systeme.io/api/tags", {
          headers: { "X-API-Key": apiKey },
        });
        if (resTags.ok) {
          const tagsData = await resTags.json();
          const tagsList = Array.isArray(tagsData) ? tagsData : (tagsData.items || []);
          const foundTag = tagsList.find(
            (t) => t.name?.toLowerCase() === tagIdentifier.toLowerCase()
          );
          if (foundTag) {
            numericTagId = foundTag.id;
            console.log(`✅ ID numérique du tag "${tagIdentifier}" trouvé : ${numericTagId}`);
          } else {
            console.error(`❌ Aucun tag nommé "${tagIdentifier}" trouvé sur Systeme.io.`);
          }
        } else {
          console.error("❌ Impossible de récupérer la liste des tags de Systeme.io :", await resTags.text());
        }
      }
    }

    let contactId = null;
    const resCreate = await fetch("https://api.systeme.io/api/contacts", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        firstName: prenom,
        lastName: nom,
      }),
    });

    if (resCreate.ok) {
      const data = await resCreate.json();
      contactId = data.id;
      console.log(`✅ Contact créé sur Systeme.io (ID: ${contactId})`);
    } else {
      console.log(`ℹ️ Contact déjà présent ou création échouée. Recherche du contact par email...`);
      const resSearch = await fetch(
        `https://api.systeme.io/api/contacts?email=${encodeURIComponent(email)}`,
        { headers: { "X-API-Key": apiKey } }
      );
      if (resSearch.ok) {
        const searchData = await resSearch.json();
        const items = Array.isArray(searchData) ? searchData : (searchData.items || []);
        if (items.length > 0) {
          contactId = items[0].id;
          console.log(`✅ Contact existant retrouvé sur Systeme.io (ID: ${contactId})`);
        }
      }
    }

    if (contactId && numericTagId) {
      const resTag = await fetch(`https://api.systeme.io/api/contacts/${contactId}/tags`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tagId: numericTagId }),
      });

      if (resTag.ok) {
        console.log(`🏷️ Tag (${numericTagId}) attribué avec succès au contact ${email}`);
      } else {
        console.error("❌ Erreur lors de l'ajout du tag :", await resTag.text());
      }
    } else {
      console.error(`⚠️ Impossible d'ajouter le tag : contactId=${contactId}, tagId=${numericTagId}`);
    }
  } catch (err) {
    console.error("❌ Erreur globale Systeme.io :", err.message);
  }
}

// -------------------------------------------------------------
// 1. WEBHOOK STRIPE (Placé AVANT les parsers JSON généraux)
// -------------------------------------------------------------
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(`❌ Erreur Signature Webhook: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const emailClient = session.customer_email || session.customer_details?.email;
      const prenomClient = session.metadata?.prenom || "";
      const nomClient = session.metadata?.nom || "";

      console.log(`💳 Paiement confirmé pour : ${emailClient}`);

      await synchroniserSystemeIO(emailClient, prenomClient, nomClient);

      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "Massokin <florian.carreras@massokin.com>",
          to: emailClient,
          reply_to: process.env.EMAIL_REPLY_TO || "florian.carreras@massokin.com",
          subject: "Accès à votre programme All Year Fit",
          html: `
            <h2>Félicitations ${prenomClient || "Client"} !</h2>
            <p>Votre paiement a été validé avec succès.</p>
            <p>Vous pouvez accéder immédiatement à votre formation en cliquant sur le lien ci-dessous :</p>
            <p><a href="${process.env.LIEN_FORMATION_SYSTEME_IO || '#'}" style="padding:10px 20px; background-color:#0070f3; color:white; text-decoration:none; border-radius:5px;">Accéder au programme</a></p>
            <br>
            <p>À très vite !</p>
          `,
        });
        console.log(`✉️ Courriel envoyé à ${emailClient}`);
      } catch (emailErr) {
        console.error("❌ Erreur envoi Resend :", emailErr);
      }
    }

    res.json({ received: true });
  }
);

// Middleware pour décoder les requêtes HTML/Formulaires
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------------------------------------------------
// 2. CRÉATION DE LA SESSION DE PAIEMENT
// -------------------------------------------------------------
app.post("/create-checkout-session", async (req, res) => {
  const { prenom = "", nom = "", email = "" } = req.body;

  if (!email) {
    return res.redirect(303, `${CANCEL_URL}?erreur=email_manquant`);
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: {
              name: "Programme en ligne sur 8 semaines All Year Fit - accès à vie",
            },
            unit_amount: 1700, // 17,00 $ CAD
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      customer_creation: "always",
      allow_promotion_codes: true,
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      metadata: { prenom, nom, source: "https://www.kinqc.ca/allyearfit" },
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error("Erreur création session Stripe :", err.message);
    res.redirect(303, `${CANCEL_URL}?erreur=paiement_indisponible`);
  }
});

app.listen(PORT, () => console.log(`Serveur All Year Fit lancé sur le port ${PORT}`));
