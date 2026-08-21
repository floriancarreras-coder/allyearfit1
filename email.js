async function envoyerEmailBienvenue(email, prenom) {
await resend.emails.send({
from: "Florian - All Year Fit <florian@massokin.com>",
to: email,
subject: "Bienvenue dans All Year Fit \uD83C\uDFC3 - votre accès est prêt",
html: `
<h1>Merci ${prenom || ""} !</h1>
<p>Votre paiement de 17&nbsp;$ CAD est confirmé. Votre accès à la méthode
<strong>All Year Fit</strong> (8 semaines + les 4 bonus) est en cours
d'activation sur la plateforme.</p>
<p><a href="${process.env.LIEN_FORMATION_SYSTEME_IO}">Accéder au programme</a></p>
<p>Si le lien ne fonctionne pas immédiatement, connectez-vous avec l'adresse
e-mail utilisée lors du paiement : ${email}</p>
<p>Pour rappel, vous bénéficiez de <strong>7 jours</strong> pour essayer la
méthode : si elle ne vous convient pas, un simple e-mail suffit pour être
remboursé intégralement.</p>
`,
});
}