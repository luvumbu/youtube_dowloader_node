<?php
// ============================================================
// Exemple de landing page statique - YouTube Downloader
// - Aucune authentification requise
// - Accessible aux robots (Googlebot, Bingbot, etc.)
// - Contenu visible meme sans JavaScript
// - SEO friendly (meta tags, Open Graph, schema.org)
// ============================================================
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<meta name="googlebot" content="index, follow">
<meta name="description" content="YouTube Downloader - Telecharge tes videos et musiques YouTube en MP3, MP4, FLAC, WAV. Rapide, gratuit, sans inscription.">
<meta name="keywords" content="youtube downloader, telecharger youtube, mp3, mp4, flac, convertisseur, bokonzi">
<meta name="author" content="Bokonzi">

<!-- Open Graph (Facebook, LinkedIn, WhatsApp) -->
<meta property="og:type" content="website">
<meta property="og:title" content="YouTube Downloader - Telecharge tes videos facilement">
<meta property="og:description" content="Telecharge tes videos et musiques YouTube en un clic. MP3, MP4, FLAC, WAV. Sans inscription.">
<meta property="og:image" content="/youtube-blue.svg">
<meta property="og:url" content="https://bokonzi.com/">
<meta property="og:locale" content="fr_FR">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="YouTube Downloader">
<meta name="twitter:description" content="Telecharge tes videos YouTube facilement.">
<meta name="twitter:image" content="/youtube-blue.svg">

<title>YouTube Downloader - Telecharge tes videos YouTube | Bokonzi</title>
<link rel="icon" href="/youtube-blue.svg" type="image/svg+xml">
<link rel="canonical" href="https://bokonzi.com/">

<!-- Schema.org pour les moteurs de recherche -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "YouTube Downloader",
  "description": "Telecharge tes videos et musiques YouTube.",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Bokonzi",
    "email": "contact@bokonzi.com"
  }
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { scroll-behavior: smooth; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f1e; color: #e4e6eb; line-height: 1.6; min-height: 100vh;
}
a { color: #3ea6ff; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Header */
.header {
    position: sticky; top: 0; z-index: 100;
    background: rgba(15, 15, 30, 0.92); backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
}
.nav {
    max-width: 1200px; margin: 0 auto; padding: 16px 24px;
    display: flex; align-items: center; justify-content: space-between;
}
.logo {
    display: flex; align-items: center; gap: 10px;
    font-size: 18px; font-weight: 700; color: #fff;
}
.logo-icon { width: 32px; height: 32px; }
.nav-links { display: flex; gap: 24px; align-items: center; }
.nav-links a { color: #a8b2d1; font-size: 14px; font-weight: 500; }
.btn {
    display: inline-block; padding: 10px 22px; border-radius: 8px;
    font-size: 14px; font-weight: 600; transition: all 0.2s; cursor: pointer;
    border: none; text-decoration: none;
}
.btn-primary { background: #e94560; color: #fff; }
.btn-primary:hover { background: #d63652; text-decoration: none; transform: translateY(-1px); }
.btn-outline { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); }
.btn-outline:hover { background: rgba(255,255,255,0.08); text-decoration: none; }

/* Hero */
.hero {
    max-width: 1200px; margin: 0 auto; padding: 80px 24px 60px;
    text-align: center;
}
.hero h1 {
    font-size: 56px; font-weight: 800; line-height: 1.1; margin-bottom: 20px;
    background: linear-gradient(135deg, #e94560 0%, #3ea6ff 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
}
.hero p { font-size: 20px; color: #a8b2d1; margin-bottom: 32px; max-width: 680px; margin-left: auto; margin-right: auto; }
.hero-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.hero-cta .btn { padding: 14px 32px; font-size: 16px; }

/* Features */
.features { max-width: 1200px; margin: 0 auto; padding: 60px 24px; }
.section-title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 12px; color: #fff; }
.section-subtitle { text-align: center; color: #a8b2d1; margin-bottom: 48px; font-size: 16px; }
.features-grid {
    display: grid; gap: 24px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
.feature-card {
    background: #1a1a2e; border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px; padding: 28px; transition: transform 0.2s, border-color 0.2s;
}
.feature-card:hover { transform: translateY(-4px); border-color: rgba(233, 69, 96, 0.4); }
.feature-icon {
    width: 48px; height: 48px; border-radius: 10px;
    background: linear-gradient(135deg, #e94560, #3ea6ff);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; margin-bottom: 16px;
}
.feature-card h3 { font-size: 18px; color: #fff; margin-bottom: 8px; }
.feature-card p { color: #a8b2d1; font-size: 14px; }

/* How it works */
.how { background: #141425; padding: 60px 24px; }
.how-inner { max-width: 1000px; margin: 0 auto; }
.steps { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 40px; }
.step { text-align: center; }
.step-num {
    width: 48px; height: 48px; border-radius: 50%;
    background: #e94560; color: #fff; font-size: 20px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;
}
.step h4 { color: #fff; margin-bottom: 6px; font-size: 16px; }
.step p { color: #a8b2d1; font-size: 14px; }

/* FAQ */
.faq { max-width: 800px; margin: 0 auto; padding: 60px 24px; }
.faq-item {
    background: #1a1a2e; border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; margin-bottom: 12px; overflow: hidden;
}
.faq-item summary {
    padding: 18px 22px; cursor: pointer; font-weight: 600; color: #fff;
    list-style: none; display: flex; justify-content: space-between; align-items: center;
}
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary::after { content: '+'; font-size: 22px; color: #e94560; }
.faq-item[open] summary::after { content: '-'; }
.faq-item p { padding: 0 22px 18px; color: #a8b2d1; font-size: 14px; }

/* CTA */
.cta-band {
    background: linear-gradient(135deg, #e94560 0%, #3ea6ff 100%);
    padding: 50px 24px; text-align: center;
}
.cta-band h2 { color: #fff; font-size: 30px; margin-bottom: 12px; }
.cta-band p { color: rgba(255,255,255,0.9); margin-bottom: 22px; }
.cta-band .btn { background: #fff; color: #1a1a2e; }
.cta-band .btn:hover { background: #f0f0f0; }

/* Footer */
.footer {
    background: #0a0a14; padding: 40px 24px 20px;
    border-top: 1px solid rgba(255,255,255,0.06);
}
.footer-inner {
    max-width: 1200px; margin: 0 auto;
    display: grid; gap: 32px; grid-template-columns: 2fr 1fr 1fr 1fr;
}
.footer-col h5 { color: #fff; font-size: 14px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
.footer-col a { display: block; color: #a8b2d1; font-size: 14px; margin-bottom: 8px; }
.footer-col p { color: #a8b2d1; font-size: 14px; }
.footer-bottom {
    max-width: 1200px; margin: 30px auto 0; padding-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.06);
    text-align: center; color: #6c7293; font-size: 13px;
}

@media (max-width: 768px) {
    .hero h1 { font-size: 38px; }
    .hero p { font-size: 17px; }
    .section-title { font-size: 28px; }
    .nav-links a:not(.btn) { display: none; }
    .footer-inner { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>

<!-- HEADER -->
<header class="header">
    <nav class="nav">
        <a href="/" class="logo">
            <svg class="logo-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="10" width="60" height="44" rx="12" ry="12" fill="#e94560"/>
                <path d="M26 22 L44 32 L26 42 Z" fill="#ffffff"/>
            </svg>
            <span>YouTube Downloader</span>
        </a>
        <div class="nav-links">
            <a href="#features">Fonctionnalites</a>
            <a href="#how">Comment ca marche</a>
            <a href="#faq">FAQ</a>
            <a href="mailto:contact@bokonzi.com">Contact</a>
            <a href="/app" class="btn btn-primary">Lancer l'app</a>
        </div>
    </nav>
</header>

<!-- HERO -->
<section class="hero">
    <h1>Telecharge tes videos YouTube en un clic</h1>
    <p>Convertis n'importe quelle video ou musique YouTube en MP3, MP4, FLAC, WAV et plus encore. Gratuit, rapide, sans inscription.</p>
    <div class="hero-cta">
        <a href="/app" class="btn btn-primary">Commencer maintenant</a>
        <a href="#features" class="btn btn-outline">En savoir plus</a>
    </div>
</section>

<!-- FEATURES -->
<section class="features" id="features">
    <h2 class="section-title">Tout ce qu'il te faut</h2>
    <p class="section-subtitle">Les outils necessaires pour telecharger, ecouter et organiser tes contenus.</p>
    <div class="features-grid">
        <div class="feature-card">
            <div class="feature-icon">&#127925;</div>
            <h3>Audio haute qualite</h3>
            <p>MP3, FLAC, WAV, AAC, OGG. Choisis ta qualite, de la plus legere a la lossless.</p>
        </div>
        <div class="feature-card">
            <div class="feature-icon">&#127916;</div>
            <h3>Video jusqu'au 1080p</h3>
            <p>MP4, MKV, WEBM. Resolution 360p, 480p, 720p, 1080p ou meilleure disponible.</p>
        </div>
        <div class="feature-card">
            <div class="feature-icon">&#128190;</div>
            <h3>Bibliotheque integree</h3>
            <p>Organise tes telechargements dans des dossiers, recherche et lis tout sur place.</p>
        </div>
        <div class="feature-card">
            <div class="feature-icon">&#127911;</div>
            <h3>Mon Flow - streaming</h3>
            <p>Cree ta propre playlist streamee sans avoir besoin de tout telecharger.</p>
        </div>
        <div class="feature-card">
            <div class="feature-icon">&#128230;</div>
            <h3>Playlists completes</h3>
            <p>Telecharge des playlists entieres en une seule action, avec suivi de progression.</p>
        </div>
        <div class="feature-card">
            <div class="feature-icon">&#128274;</div>
            <h3>100% prive</h3>
            <p>Aucune inscription, aucune donnee envoyee a l'exterieur. Tout reste en local.</p>
        </div>
    </div>
</section>

<!-- HOW IT WORKS -->
<section class="how" id="how">
    <div class="how-inner">
        <h2 class="section-title">Comment ca marche</h2>
        <p class="section-subtitle">Trois etapes, c'est tout.</p>
        <div class="steps">
            <div class="step">
                <div class="step-num">1</div>
                <h4>Colle l'URL</h4>
                <p>Copie le lien d'une video, d'un short ou d'une playlist YouTube.</p>
            </div>
            <div class="step">
                <div class="step-num">2</div>
                <h4>Choisis le format</h4>
                <p>Audio ou video, qualite, dossier de destination.</p>
            </div>
            <div class="step">
                <div class="step-num">3</div>
                <h4>Telecharge</h4>
                <p>Le fichier arrive dans ta bibliotheque, pret a etre ecoute.</p>
            </div>
        </div>
    </div>
</section>

<!-- FAQ -->
<section class="faq" id="faq">
    <h2 class="section-title">Questions frequentes</h2>
    <p class="section-subtitle">Les reponses aux questions les plus courantes.</p>

    <details class="faq-item">
        <summary>Est-ce gratuit ?</summary>
        <p>Oui, YouTube Downloader est totalement gratuit et sans inscription.</p>
    </details>
    <details class="faq-item">
        <summary>Mes donnees sont-elles envoyees quelque part ?</summary>
        <p>Non. L'outil tourne en local sur ta machine. Aucune donnee n'est envoyee a des tiers.</p>
    </details>
    <details class="faq-item">
        <summary>Puis-je telecharger une playlist entiere ?</summary>
        <p>Oui, colle simplement l'URL de la playlist. L'outil traite chaque video une par une.</p>
    </details>
    <details class="faq-item">
        <summary>Quels formats sont supportes ?</summary>
        <p>Audio : MP3, FLAC, WAV, AAC, OGG. Video : MP4, MKV, WEBM. Qualite jusqu'a 1080p (ou meilleure selon la source).</p>
    </details>
    <details class="faq-item">
        <summary>Comment vous contacter ?</summary>
        <p>Par email a <a href="mailto:contact@bokonzi.com">contact@bokonzi.com</a>.</p>
    </details>
</section>

<!-- CTA -->
<section class="cta-band">
    <h2>Prêt a commencer ?</h2>
    <p>Lance l'application et telecharge ta premiere video en moins d'une minute.</p>
    <a href="/app" class="btn">Lancer l'application</a>
</section>

<!-- FOOTER -->
<footer class="footer">
    <div class="footer-inner">
        <div class="footer-col">
            <div class="logo" style="margin-bottom: 12px;">
                <svg class="logo-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="10" width="60" height="44" rx="12" ry="12" fill="#e94560"/>
                    <path d="M26 22 L44 32 L26 42 Z" fill="#ffffff"/>
                </svg>
                <span>YouTube Downloader</span>
            </div>
            <p>Telecharge et organise tes videos YouTube en toute simplicite.</p>
        </div>
        <div class="footer-col">
            <h5>Produit</h5>
            <a href="#features">Fonctionnalites</a>
            <a href="#how">Comment ca marche</a>
            <a href="/app">Lancer l'app</a>
        </div>
        <div class="footer-col">
            <h5>Support</h5>
            <a href="#faq">FAQ</a>
            <a href="mailto:contact@bokonzi.com">Contact</a>
        </div>
        <div class="footer-col">
            <h5>Legal</h5>
            <a href="/mentions-legales">Mentions legales</a>
            <a href="/confidentialite">Confidentialite</a>
        </div>
    </div>
    <div class="footer-bottom">
        &copy; <?php echo date('Y'); ?> Bokonzi - Tous droits reserves.
    </div>
</footer>

</body>
</html>
