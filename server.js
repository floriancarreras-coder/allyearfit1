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
// 1. WEBHOOK STRIPE (Reçoit la confirmation de paiement)
// -------------------------------------------------------------
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }), // Obligatoire pour la vérification Stripe
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

    // Si le paiement a réussi
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const emailClient = session.customer_email || session.customer_details?.email;
      const prenomClient = session.metadata?.prenom || "Client";

      console.log(`💳 Paiement confirmé pour : ${emailClient}`);

      // Envoi du courriel automatique avec Resend
      try {
        await resend.emails.send({
          from: process.env.EMAIL_FROM || "Massokin <florian.carreras@massokin.com>",
          to: emailClient,
          reply_to: process.env.EMAIL_REPLY_TO || "florian.carreras@massokin.com",
          subject: "Accès à votre programme All Year Fit",
          html: `
            <h2>Félicitations ${prenomClient} !</h2>
            <p>Votre paiement a été validé avec succès.</p>
            <p>Vous pouvez accéder immédiatement à votre formation en cliquant sur le lien ci-dessous :</p>
            <p><a href="${process.env.LIEN_FORMATION_SYSTEME_IO || '#'}" style="padding:10px 20px; background-color:#0070f3; color:#white; text-decoration:none; border-radius:5px;">Accéder au programme</a></p>
            <br>
            <p>À très vite !</p>
          `,
        });
        console.log(`✉️ Courriel d'accès envoyé avec succès à ${emailClient}`);
      } catch (emailErr) {
        console.error("❌ Erreur lors de l'envoi Resend :", emailErr);
      }
    }

    res.json({ received: true });
  }
);

// -------------------------------------------------------------
// 2. CRÉATION DE LA SESSION DE PAIEMENT (Formulaire)
// -------------------------------------------------------------
app.post(
  "/create-checkout-session",
  express.urlencoded({ extended: true }),
  async (req, res) => {
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
                name: "All Year Fit",
              },
              unit_amount: 1700, // 17,00 $ CAD
            },
            quantity: 1,
          },
        ],
        customer_email: email,
        customer_creation: "always",
        success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: CANCEL_URL,
        metadata: { prenom, nom, source: "https://www.kinqc.ca/allyearfit" },
      });

      res.redirect(303, session.url);
    } catch (err) {
      console.error("Erreur création session Stripe :", err.message);
      res.redirect(303, `${CANCEL_URL}?erreur=paiement_indisponible`);
    }
  }
);

app.listen(PORT, () => console.log(`Serveur All Year Fit lancé sur le port ${PORT}`));
