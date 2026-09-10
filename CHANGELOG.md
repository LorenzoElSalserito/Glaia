# Changelog

Tutte le modifiche rilevanti di Glaia sono documentate in questo file.

Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e
[Semantic Versioning](https://semver.org/lang/it/).

Scrivi le modifiche in corso sotto `## [Unreleased]`: una build di distribuzione
le consolida automaticamente nella nuova versione.

## [Unreleased]

## [0.2.0] - 2026-09-10

- Aggiunto zoom globale persistente al 25%, 50%, 75%, 100%, 125% e 150%, sincronizzato fra interfaccia, provider, menu e scorciatoie.
- Adattamento della finestra all’area utile del monitor e layout responsive da 800×600 a 3840×2160, con modali e pannelli scorrevoli.
- Eliminati troncamenti dei nomi provider e degli URL: testi completi a capo o consultabili tramite scorrimento, anche con contenuti lunghi.
- Corrette coordinate della vista provider con zoom e ridimensionamento; mantenuta copertura dei provider durante l’apertura delle finestre di dialogo.
- Aggiunti test E2E su 42 combinazioni risoluzione/zoom, testi italiani e inglesi, persistenza, navigazione e regressioni copia/incolla; dati di test isolati.
- Corretta pipeline Linux/Windows/macOS: upload del binario versionato realmente generato, verifica del file e aggiornamento Actions al runtime Node 24 e comandi di test compatibili con Node 22.

## [0.1.3] - 2026-08-30

- Maintenance release, now with fully documented support

## [0.1.2] - 2026-08-30

- Maintenance release with support for copy-paste functions

## [0.1.1] - 2026-08-30

- Prima release inserita nella pipeline di packaging versionata.
