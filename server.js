import express from "express";
import Stripe from "stripe";
import { Resend } from "resend";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const PORT = process.env.PORT || 3000;
const PRICE_ID = process.env.STRIPE_PRICE_ID;

// Définition d'un domaine de secours si les variables d'environnement manquent
const DEFAULT_DOMAIN = "https://massokin.com"; // Remplacez par votre domaine principal
const SUCCESS_URL = process.env.SUCCESS_URL || `${DEFAULT_DOMAIN}/merci`;
const CANCEL_URL = process.env.CANCEL_URL || `${DEFAULT_DOMAIN}/#offer`;

// 1. Réception du formulaire de la landing page + création de la session Stripe
app.post(
  "/create-checkout-session",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const { prenom = "", nom = "", email = "" } = req.body;

    if (!email) {
      return res.redirect(303, `${CANCEL_URL}?erreur=email_manquant`);
    }

    try {
      if (!PRICE_ID) {
        throw new Error("STRIPE_PRICE_ID n'est pas défini dans l'environnement.");
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        customer_email: email,
        customer_creation: "always",
        success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: CANCEL_URL,
        metadata: { prenom, nom, source: "landing-all-year-fit" },
      });

      res.redirect(303, session.url);
    } catch (err) {
      console.error("Erreur création session Stripe :", err.message);
      res.redirect(303, `${CANCEL_URL}?erreur=paiement_indisponible`);
    }
  }
);

app.listen(PORT, () => console.log(`Serveur All Year Fit lancé sur le port ${PORT}`));
