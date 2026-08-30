# BUILD_DEF — Build automatizzata, versionata e conforme per progetti Electron

Guida di riferimento alla pipeline di release di AssociaGo e alla sua riproduzione su
qualsiasi altro progetto npm che impacchetta con `electron-builder`.

Copre due problemi distinti che vengono spesso confusi:

1. **Versionamento automatico** — una sola fonte di verità, propagata a ogni riferimento
   a ogni build, senza interventi manuali.
2. **Conformità del pacchetto** — il `.deb` prodotto da `electron-builder` è incompleto;
   va ricostruito con i metadati che Debian richiede. Gli altri formati (`.dmg`, `.exe`,
   `AppImage`, `snap`, `.rpm`) non hanno questo problema e vengono trattati a parte.

Ambiente di riferimento: Linux Debian/Ubuntu, Node 20, `electron-builder` 24.x.

---

## 1. Il problema

### 1.1 La versione

In un progetto Electron con backend la versione vive in più posti:

| File | Campo | Chi lo legge |
|---|---|---|
| `desktop/package.json` | `version` | `app.getVersion()`, `electron-builder`, npm |
| `desktop/package.json` | `build.artifactName` | nome file degli artefatti |
| `desktop/package-lock.json` | `version`, `packages[""].version` | `npm ci` |
| `build.gradle` | `version` | nome del JAR Spring Boot, `build-info.properties` |

Tenerli allineati a mano fallisce sempre. I sintomi tipici sono: artefatto
`associago_v0.1.2.deb` che contiene la versione 0.1.4, changelog fermo alla prima
release, JAR backend di una versione precedente incluso nel bundle.

### 1.2 Il `.deb`

`electron-builder` costruisce il `.deb` invocando **FPM**, che produce un pacchetto
funzionante ma non conforme. Confronto con un pacchetto Debian sano:

| Elemento | Pacchetto conforme | Output FPM |
|---|---|---|
| `usr/share/doc/<pkg>/changelog.gz` | changelog reale, formato Debian, multi-entry | stub `* Package created with FPM.` |
| `usr/share/doc/<pkg>/copyright` | DEP-5 machine-readable | assente |
| `DEBIAN/conffiles` | elenco dei file sotto `/etc` | assente |
| `usr/share/pixmaps/<pkg>.png` | icona risolvibile per nome | assente |
| `DEBIAN/control` → `Section` | sezione valida dell'archivio | `default` (invalida) |
| `DEBIAN/control` → campi | solo campi standard | include `License:` e `Vendor:` |
| Permessi | dir 0755, file 0644/0755 | eredita l'umask del builder (0775/0664/0444) |

---

## 2. Architettura

```
npm run dist
│
├─ 1. version:bump          scripts/version-bump.js
│     ├─ package.json            version + build.artifactName
│     ├─ package-lock.json       version + packages[""].version
│     ├─ build.gradle            version = 'X.Y.Z'
│     ├─ CHANGELOG.md            [Unreleased] → [X.Y.Z] - YYYY-MM-DD
│     ├─ release-history.json    record machine-readable della release
│     └─ .release-pending.json   marker di crash-safety
│
├─ 2. package:prepare       scripts/package-prepare.js
│     ├─ ./gradlew bootJar       backend con la NUOVA versione
│     ├─ prune build/libs        elimina i JAR delle versioni precedenti
│     ├─ npm run build:jre       JRE bundled
│     ├─ npm run build           bundle main/preload/renderer
│     ├─ copia icone in build/
│     └─ verify:packaging        asset presenti + versioni coerenti  ← fail fast
│
├─ 3. electron-builder      produce .deb .AppImage .snap (Linux)
│
└─ 4. afterAllArtifactBuild scripts/after-all-artifact-build.js
      ├─ per ogni .deb: fakeroot node scripts/deb-finalize.js <deb>
      └─ rimuove .release-pending.json   ← release completata
```

Principio guida: **un solo dato scritto a mano** (le voci sotto `## [Unreleased]` in
`CHANGELOG.md`). Tutto il resto è derivato.

---

## 3. Versionamento automatico

### 3.1 Fonte di verità unica

`desktop/package.json` → `version`. Ogni altro riferimento è derivato e riscritto a
ogni build.

Il primo intervento è eliminare il nome artefatto hardcoded. `electron-builder`
espande le macro `${version}`, `${ext}`, `${name}`, `${productName}`, `${arch}`,
`${os}` dentro `artifactName`:

```json
"artifactName": "associago_v${version}.${ext}"
```

`version-bump.js` **riscrive sempre** questo campo con la macro letterale, così un
eventuale ritorno al valore hardcoded viene corretto alla build successiva.

### 3.2 Regola di bump

Default `x.y.(z+1)`. Interfaccia:

```bash
npm run version:bump                  # patch
node scripts/version-bump.js --minor  # x.(y+1).0
node scripts/version-bump.js --major  # (x+1).0.0
node scripts/version-bump.js --set 1.2.3
node scripts/version-bump.js --no-bump   # risincronizza i riferimenti, versione invariata
node scripts/version-bump.js --dry-run   # stampa e non scrive
```

Sono accettate solo versioni `X.Y.Z` piane. Un pre-release (`1.2.3-beta`) verrebbe
interpretato da dpkg come revisione Debian e cambierebbe il nome del changelog
(§5.4), quindi `parseVersion` lo rifiuta esplicitamente.

### 3.3 Scritture atomiche

I sei file vengono preparati in memoria e scritti in blocco. Se una scrittura
fallisce, tutte le precedenti vengono ripristinate dal backup in memoria:

```js
function flush(writes) {
  const backups = []
  try {
    for (const write of writes) {
      const existed = fs.existsSync(write.file)
      backups.push({ file: write.file, existed, content: existed ? fs.readFileSync(write.file) : null })
      fs.writeFileSync(write.file, write.content)
    }
  } catch (error) {
    for (const backup of backups.reverse()) {
      if (backup.existed) fs.writeFileSync(backup.file, backup.content)
      else if (fs.existsSync(backup.file)) fs.unlinkSync(backup.file)
    }
    throw error
  }
}
```

Senza questo, un errore a metà lascia `package.json` alla 0.1.4 e `build.gradle` alla
0.1.5 — cioè esattamente il problema che la pipeline deve eliminare.

### 3.4 Crash-safety: il marker pending

Il bump avviene **prima** della build, perché il JAR Spring Boot e il bundle Electron
devono nascere già con la versione nuova. Ma se la build fallisce dopo il bump, la
versione è già stata consumata: dieci build fallite bruciano dieci numeri.

Soluzione:

- il bump scrive `scripts/.release-pending.json` con la versione appena creata;
- il run successivo, se trova un marker con la versione **corrente**, non bumpa e la
  riusa;
- l'hook `afterAllArtifactBuild` cancella il marker solo a artefatti prodotti.

Il file è in `.gitignore`: è stato locale, non stato di progetto.

Per forzare comunque un nuovo numero: `node scripts/version-bump.js --force`.

### 3.5 CI: un bump per release, non per runner

Una matrice `ubuntu / windows / macos` esegue `npm run dist` tre volte. Tre bump
indipendenti producono tre versioni divergenti per la stessa release.

`version-bump.js` non bumpa se `process.env.CI` è valorizzata oppure se
`ASSOCIAGO_NO_BUMP=1`. In CI la versione arriva dal commit; il bump lo si fa in
locale oppure in un job di release dedicato che committa il risultato.

### 3.6 Pruning dei JAR obsoleti

`build/libs` accumula un JAR per release e `extraResources` li copia **tutti** in
`resources/backend`. Il main process seleziona il primo `*.jar` che trova, in ordine
di `readdir`, quindi un JAR vecchio può oscurare il backend corrente.

`package-prepare.js` elimina da `build/libs` tutto ciò che non corrisponde alla
versione in `package.json`, subito dopo `bootJar`, e fallisce se il JAR della versione
attesa non esiste — segnale inequivocabile che `build.gradle` è fuori sincrono.

### 3.7 Guardia di coerenza

`verify:packaging` gira dentro `package:prepare`, **prima** di `electron-builder`, e
interrompe la build se:

- `package-lock.json` (entrambi i campi) diverge da `package.json`;
- `build.gradle` diverge o non ha l'assegnazione top-level;
- `build.artifactName` non è la macro letterale;
- `release-history.json` non ha un record per la versione corrente;
- `CHANGELOG.md` non ha una sezione per la versione corrente.

È la rete che rende la pipeline non-silenziosa: qualunque manomissione manuale
emerge prima che l'artefatto venga costruito.

---

## 4. Changelog

### 4.1 Il flusso

```
CHANGELOG.md ## [Unreleased]     ← l'unico input umano
        │  version-bump
        ▼
CHANGELOG.md ## [X.Y.Z] - data   +   release-history.json
                                             │  deb-finalize
                                             ▼
                        usr/share/doc/<pkg>/changelog.gz
```

Durante lo sviluppo si scrive normalmente in Keep a Changelog:

```markdown
## [Unreleased]

### Added
- Esportazione soci in CSV.

### Fixed
- Recupero password con e-mail maiuscole.
```

`npm run dist` consolida la sezione in `## [0.1.6] - 2026-08-25`, ricrea
`## [Unreleased]` vuota e aggiunge il record a `release-history.json`.

Se `[Unreleased]` è vuota la voce diventa `Maintenance release.`: il changelog
Debian non può avere un'entry senza corpo, quindi un fallback è obbligatorio.

### 4.2 Perché un file JSON separato

Il changelog Debian **non** viene rigenerato riparsando il Markdown a ogni build.
`release-history.json` conserva versione, data RFC 2822, distribuzione, urgency,
maintainer e voci già normalizzate:

```json
{
  "releases": [
    {
      "version": "0.1.5",
      "date": "Tue, 25 Aug 2026 19:34:04 +0200",
      "distribution": "unstable",
      "urgency": "medium",
      "maintainer": "Lorenzo DM <commercial.lorenzodm@gmail.com>",
      "entries": ["Fixed: ..."]
    }
  ]
}
```

Il Markdown resta leggibile e modificabile dalle persone; il packaging legge una
struttura stabile. Modificare a posteriori una vecchia sezione di `CHANGELOG.md` non
altera i changelog già pubblicati, che è il comportamento corretto.

### 4.3 Normalizzazione delle voci

`parseEntries` appiattisce Keep a Changelog in voci piatte:

- `### Added` + `- Foo` → `Added: Foo`
- `- Foo` senza sottosezione → `Foo`
- le righe di continuazione di un bullet vengono unite alla stessa voce

### 4.4 Formato Debian

```
associago-desktop (0.1.5) unstable; urgency=medium

  * Fixed: Packaging: i permessi vengono letti tramite `find`, non tramite
    `fs.stat`.

 -- Lorenzo DM <commercial.lorenzodm@gmail.com>  Tue, 25 Aug 2026 19:34:04 +0200
```

Vincoli non negoziabili, ognuno dei quali fa fallire `dpkg-parsechangelog`:

- prima riga `nome (versione) distribuzione; urgency=livello`, senza indentazione;
- riga vuota, poi voci con due spazi iniziali e `*`; continuazione a quattro spazi;
- riga vuota, poi la riga di firma che inizia con **uno** spazio, `--`, due spazi
  prima della data;
- data RFC 2822 con giorno della settimana corretto rispetto alla data.

Il giorno della settimana viene calcolato, mai scritto a mano.

La compressione è deterministica — `zlib.gzipSync(buf, { level: 9, mtime: 0 })`,
equivalente a `gzip -9 -n`. Senza `mtime: 0` ogni build produce byte diversi a parità
di contenuto e gli `md5sums` non sono riproducibili.

`deb-finalize` valida il testo con `dpkg-parsechangelog` **prima** di comprimerlo e
verifica che l'entry in cima sia la versione attesa. Un changelog malformato ferma la
build invece di finire dentro il pacchetto.

---

## 5. Ricostruzione del `.deb`

Hook `afterAllArtifactBuild`, eseguito sotto `fakeroot`:

```js
spawnSync('fakeroot', [process.execPath, 'scripts/deb-finalize.js', deb], { stdio: 'inherit' })
```

`fakeroot` è **obbligatorio**: `dpkg-deb -R` / `-b` devono vedere `root:root`,
altrimenti il pacchetto installa file di proprietà dell'utente che ha compilato.
L'hook fallisce con un errore esplicito se `fakeroot` manca, invece di produrre un
pacchetto rotto.

Sequenza: `dpkg-deb -R` → modifiche → verifiche → `dpkg-deb --build`.

### 5.1 `copyright` DEP-5

```
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: associago-desktop
Upstream-Contact: Lorenzo DM <commercial.lorenzodm@gmail.com>
Source: https://github.com/lorenzodm/AssociaGo

Files: *
Copyright: 2026 Lorenzo DM <commercial.lorenzodm@gmail.com>
License: AGPL-3+

License: AGPL-3+
 This program is free software: you can redistribute it and/or modify
 ...
 .
 On Debian systems, the complete text of the GNU Affero General Public License
 version 3 can be found in "/usr/share/common-licenses/AGPL-3".
```

Regole: righe vuote scritte come ` .`, testo indentato di **uno** spazio, licenze
standard referenziate in `/usr/share/common-licenses/` invece di essere incorporate.

La licenza viene riconosciuta leggendo `LICENSE` dalla root del repository. Se non
corrisponde a un identificativo noto, il testo integrale viene incorporato indentato:
il pacchetto spedisce comunque i termini completi.

Il `LICENSE` grezzo eventualmente presente in `usr/share/doc/` viene rimosso:
`copyright` è il file canonico e averne due è ridondanza non conforme.

### 5.2 `conffiles`

Elenco generato dal contenuto reale di `etc/`, un percorso assoluto per riga.
Se `etc/` non esiste il file viene **omesso**: un `conffiles` vuoto è una violazione
di policy, non un no-op.

Voce di autostart di AssociaGo, spedita disattivata:

```ini
[Desktop Entry]
Type=Application
Name=AssociaGo
Exec=/opt/AssociaGo/associago-desktop %U
Icon=associago-desktop
Terminal=false
Hidden=true
NoDisplay=true
X-GNOME-Autostart-enabled=false
```

Il pacchetto fornisce lo slot di autostart senza cambiare il comportamento
dell'applicazione dopo l'installazione: l'utente lo abilita se vuole. `Hidden=true`
è il disabilitatore riconosciuto dalla specifica FreeDesktop; `X-GNOME-Autostart-enabled=false`
copre le sessioni GNOME.

Essendo sotto `/etc`, è un file di configurazione: entra in `conffiles` e dpkg
preserva le modifiche dell'utente attraverso gli aggiornamenti.

### 5.3 `control`

- campi riordinati secondo l'ordine canonico dpkg, `Description` sempre ultimo
  (le sue righe di continuazione romperebbero i campi successivi);
- `License:` e `Vendor:` rimossi — sono campi FPM, non campi binari Debian;
- `Section` forzata a un valore valido, `Priority: optional`, `Version` riallineata a
  `package.json`;
- `Description` normalizzata: synopsis ≤ 80 caratteri, corpo indentato di uno spazio,
  paragrafi vuoti come ` .`, righe a capo entro 80 colonne.

**`office` non è una sezione Debian.** L'elenco valido è in
`/usr/share/lintian/data/fields/archive-sections`; per un gestionale si usa `misc`
(oppure `database`, `utils`). La collocazione nel menu Office è un fatto diverso e
arriva da `Categories=Office;` nel file `.desktop`, che resta invariato.

Se la synopsis eccede 80 caratteri viene troncata su confine di parola e il testo
integrale viene spostato in cima alla descrizione estesa: nessun contenuto va perso.

### 5.4 Nome del changelog: nativo o no

- versione **senza** trattino (`0.1.5`) → pacchetto **nativo** → `changelog.gz`
- versione **con** revisione Debian (`0.1.5-1`) → `changelog.Debian.gz`

Usare il nome sbagliato produce `wrong-name-for-changelog-of-native-package`. Con lo
schema `X.Y.Z` di questa pipeline il pacchetto è sempre nativo. `deb-finalize` rimuove
comunque entrambe le varianti prima di installare quella corretta, così il passaggio
da uno schema all'altro non lascia file orfani.

### 5.5 Permessi — e il tranello `fakeroot` / `statx`

`electron-builder` scrive gli artefatti con l'umask del builder. Nell'archivio
finiscono directory 0775, binari 0775, librerie condivise eseguibili e i file di
sola lettura del JRE a 0444.

Regole applicate:

| Elemento | Modo |
|---|---|
| directory (inclusa la root `./`) | 0755 |
| `*.so`, `*.so.N` | 0644 |
| file con bit di esecuzione | 0755 |
| altri file | 0644 |
| `DEBIAN/{preinst,postinst,prerm,postrm,config}` | 0755 |
| altri file in `DEBIAN/` | 0644 |
| bit setuid/setgid/sticky | preservati |

Gli oggetti condivisi vengono caricati con `dlopen`, non eseguiti: 0644 è corretto e
risolve `shared-library-is-executable`.

**Il tranello.** Sotto `fakeroot`, `fs.statSync` di Node e `dpkg-deb` vedono permessi
diversi:

```
$ fakeroot bash -c 'dpkg-deb -R pkg.deb ex; \
    echo "coreutils: $(stat -c %a ex/.../legal/LICENSE)"; \
    node -e "console.log(\"node:\", (require(\"fs\").statSync(process.argv[1]).mode & 0o7777).toString(8))" ex/.../legal/LICENSE'
coreutils: 444
node: 644
```

`fakeroot` mantiene un proprio database di proprietà e permessi e intercetta
`stat`/`lstat`, ma **non** la syscall `statx` che Node usa. Node legge quindi il modo
reale su disco, `dpkg-deb` legge quello del database di fakeroot — ed è quest'ultimo a
finire nell'archivio.

Conseguenza pratica: un `chmod` condizionato a `fs.statSync` non viene mai eseguito
perché Node crede che il permesso sia già corretto, e il pacchetto esce con 0444.

La soluzione è leggere i permessi con uno strumento che `fakeroot` intercetta:

```js
const out = sh('find', [workDir, '-mindepth', '0', '-printf', '%m %y %p\\n'])
```

`fs.chmodSync` **è** intercettato da fakeroot, quindi la scrittura resta in Node; solo
la lettura deve passare da `find`. Questo comportamento è coperto da un test di
regressione che include un file 0444 nel pacchetto sintetico.

### 5.6 `md5sums`

Rigenerato da zero su tutto il payload finale — non aggiornato in modo incrementale,
che è il modo più semplice per avere un checksum stantio.

Formato: `<md5>  <percorso relativo>`, due spazi, senza `./` iniziale, ordinato,
esclusa la directory `DEBIAN`. Verificato con `md5sum -c --quiet` prima del repack:
un mismatch ferma la build.

### 5.7 lintian

Eseguito dopo il repack, **solo informativo**: non deve mai bloccare una release.

Tag che restano e sono attesi per un bundle Electron di terze parti:

| Tag | Perché è accettabile |
|---|---|
| `dir-or-file-in-opt` | i pacchetti vendor fuori archivio installano in `/opt/<Prodotto>`, come Chrome, VS Code, Slack |
| `unstripped-binary-or-object` | i binari Electron/JRE arrivano precompilati; strippare rischia di romperli |
| `embedded-library` | Chromium incorpora libpng, freetype, libjpeg… per progetto |
| `missing-dependency-on-libc` | dipendenza implicita, non dichiarata da FPM |
| `jar-not-in-usr-share` | il backend vive accanto all'app in `/opt` |
| `maintainer-script-ignores-errors`, `postrm-removes-alternative` | script generati da electron-builder |

Tutti i tag **eliminabili** lo sono già stati: `unknown-section`, `synopsis-too-long`,
`extended-description-line-too-long`, `wrong-name-for-changelog-of-native-package`,
`non-standard-dir-perm`, `non-standard-file-perm`, `non-standard-executable-perm`,
`odd-permissions-on-shared-library`, `shared-library-is-executable`.

### 5.8 Idempotenza

Rieseguire `deb-finalize` sullo stesso `.deb` produce lo stesso risultato: il
changelog è compresso in modo deterministico, i file stale vengono rimossi prima di
essere riscritti, `md5sums` è rigenerato integralmente. Verificato da test.

---

## 6. Gli altri formati

La versione arriva **sempre** da `package.json`: `version-bump` è quindi sufficiente
per tutti i target. Solo il `.deb` richiede la ricostruzione dei metadati.

| Formato | Versione | Nome file | Metadati aggiuntivi |
|---|---|---|---|
| `.dmg` (macOS) | `CFBundleShortVersionString` da `package.json` | `artifactName` | `dmg.title: "AssociaGo ${version}"` |
| `.exe` NSIS (Windows) | risorsa di versione dell'eseguibile | `artifactName` | `nsis.uninstallDisplayName: "AssociaGo ${version}"` |
| `AppImage` | da `package.json` | `artifactName` | nessuno |
| `snap` | da `package.json` | `artifactName` | `snap.summary` |
| `.deb` | riscritta in `control` | `artifactName` | tutto il §5 |
| `.rpm` | da `package.json` | `artifactName` | `%changelog` non popolato — vedi sotto |

Note operative:

- **`.dmg` e `.exe` si costruiscono solo sul rispettivo sistema operativo.** In una
  matrice CI l'hook `afterAllArtifactBuild` gira su tutti e tre i runner ma trova
  `.deb` solo su Linux; sugli altri si limita a rimuovere il marker pending.
- **`.rpm`**: se lo si aggiunge ai target, il `%changelog` resta vuoto. Si popola con
  lo stesso `release-history.json`, in un formato diverso (`* Tue Aug 25 2026
  Maintainer <mail> - 0.1.5-1`), ripacchettando con `rpmrebuild`. Stessa architettura,
  renderer diverso.
- **`snap`**: confinato, quindi la voce di autostart in `/etc/xdg/autostart` non si
  applica; il suo equivalente è un `daemon`/`autostart` nello snapcraft.yaml.
- La macro `${version}` in `artifactName` vale per **tutti** i target: sostituire il
  nome hardcoded risolve la denominazione ovunque in un colpo solo.

---

## 7. Portare la pipeline su un altro progetto npm

### 7.1 Prerequisiti

```bash
sudo apt install fakeroot dpkg-dev lintian findutils
```

`dpkg-deb`, `md5sum`, `find` sono obbligatori; `lintian` e `dpkg-parsechangelog` sono
opzionali e i controlli corrispondenti vengono saltati se assenti.

### 7.2 File da copiare

```
scripts/lib/release-meta.js          percorsi, versioni, date, changelog
scripts/version-bump.js              bump + propagazione + consolidamento
scripts/deb-finalize.js              ricostruzione del .deb
scripts/after-all-artifact-build.js  hook electron-builder
test/release-packaging.test.mjs      suite di test
CHANGELOG.md                         con la sezione ## [Unreleased]
```

### 7.3 Punti da adattare

**`scripts/lib/release-meta.js`** — l'oggetto `paths`. Se non c'è Gradle, si rimuove
`buildGradle` da `paths`, dalle scritture in `version-bump.js` e dai controlli in
`verify-packaging-assets.js`. Aggiungere altre fonti di versione (un `.csproj`, un
`pyproject.toml`, un `Cargo.toml`) significa aggiungere una funzione di trasformazione
e una voce nell'array `writes`.

**`scripts/version-bump.js`** — la costante `ARTIFACT_NAME` e il prefisso della
variabile d'ambiente `ASSOCIAGO_NO_BUMP`.

**`scripts/deb-finalize.js`** — le costanti in testa:

```js
const PKG_NAME = 'associago-desktop'   // = build.executableName
const SECTION  = 'misc'                // sezione valida dell'archivio Debian
```

`PKG_NAME` deve coincidere con `build.executableName`, perché è il nome che FPM usa
per `usr/share/doc/<pkg>/`. Da rivedere inoltre: `detectLicense` (se la licenza non è
AGPL-3), `buildAutostartEntry` (o rimuoverne la chiamata se non serve autostart), il
percorso dell'icona sorgente.

### 7.4 Modifiche a `package.json`

```json
{
  "scripts": {
    "version:bump": "node scripts/version-bump.js",
    "version:show": "node scripts/version-bump.js --no-bump --dry-run",
    "dist": "npm run version:bump && npm run package:prepare && electron-builder"
  },
  "build": {
    "artifactName": "myapp_v${version}.${ext}",
    "afterAllArtifactBuild": "scripts/after-all-artifact-build.js",
    "deb": { "packageCategory": "misc", "priority": "optional" }
  }
}
```

`deb.packageCategory` è un blocco **di primo livello** in `build`, fratello di
`linux`, non annidato dentro. Annidarlo sotto `linux` lo rende silenziosamente
inefficace — errore facile da non notare, perché non produce alcun avviso.

Aggiungere a `.gitignore`:

```
scripts/.release-pending.json
dist-electron
```

### 7.5 Bootstrap iniziale

`release-history.json` non può partire vuoto, altrimenti `deb-finalize` rifiuta la
build (nessun record per la versione corrente). Si crea a mano un record per la
versione già rilasciata:

```json
{
  "releases": [
    {
      "version": "0.1.2",
      "date": "Sat, 01 Aug 2026 22:22:31 +0200",
      "distribution": "unstable",
      "urgency": "medium",
      "maintainer": "Nome Cognome <mail@example.com>",
      "entries": ["Prima release impacchettata."]
    }
  ]
}
```

La data deve essere RFC 2822 valida, giorno della settimana incluso e coerente.
Verifica: `dpkg-parsechangelog -l <file>` sul changelog generato.

### 7.6 Verifica

```bash
npm run version:show                    # nessuna scrittura
npm test                                # unit + e2e del .deb
npm run dist                            # build completa
dpkg-deb -f  dist-electron/*.deb        # control
dpkg-deb -c  dist-electron/*.deb        # payload e permessi
lintian dist-electron/*.deb
```

---

## 8. Strategia di test

`test/release-packaging.test.mjs`, eseguibile con `node --test`, nessuna dipendenza
esterna.

**Unitari** — aritmetica delle versioni; riscrittura di `build.gradle` limitata
all'assegnazione top-level (le versioni dei plugin e delle dipendenze non devono
essere toccate); parsing Keep a Changelog; consolidamento della sezione Unreleased;
formato data RFC 2822; a capo delle voci; ordinamento dei campi `control`;
normalizzazione della descrizione a 80 colonne senza perdita di testo; regola
nativo/non-nativo per il nome del changelog; validità della `Section` verificata
contro il database lintian; normalizzazione dei permessi con conservazione del setuid;
determinismo del gzip; forma DEP-5 del `copyright`.

**Integrazione** — `dpkg-parsechangelog` deve accettare il changelog generato, sia
l'entry in cima sia quelle precedenti (`--offset 1 --count 1`); `verify-packaging-assets`
non deve segnalare divergenze sul repository reale; `--dry-run` non deve scrivere
nulla.

**End-to-end** — costruisce un `.deb` sintetico con la stessa patologia dell'output
FPM (campi `License`/`Vendor`, `Section: default`, stub di changelog, `LICENSE`
grezzo, directory 0775, `.so` eseguibile, file 0444), esegue il vero
`deb-finalize.js` sotto `fakeroot` e verifica sul pacchetto risultante: campi control,
presenza e assenza dei file attesi, `conffiles`, proprietà `root:root` su ogni voce,
tutti i modi in `{0644, 0755, dir 0755}`, elenco esatto di `md5sums` più `md5sum -c`,
changelog che riparte con `dpkg-parsechangelog`, e **idempotenza** su una seconda
esecuzione. Un secondo test verifica che una versione assente da
`release-history.json` faccia fallire il finalize con exit code 1.

I test che richiedono `dpkg-deb`/`fakeroot`/`dpkg-parsechangelog` si auto-escludono se
gli strumenti mancano, così la suite resta verde su macOS e Windows.

---

## 9. Riferimento rapido

```bash
npm run dist              # bump patch + build completa + finalize
npm run version:show      # versione corrente, nessuna scrittura
npm run version:bump      # solo bump
npm test                  # suite completa
CI=1 npm run dist         # build senza bump (matrici CI)

node scripts/version-bump.js --minor
node scripts/version-bump.js --set 1.0.0
node scripts/version-bump.js --force          # ignora il marker pending
fakeroot node scripts/deb-finalize.js pkg.deb # finalize manuale
```

### Diagnostica

| Sintomo | Causa | Rimedio |
|---|---|---|
| `release-history.json has no entry for X` | build lanciata saltando il bump | `npm run version:bump` |
| `No backend JAR for version X` | `build.gradle` fuori sincrono | `node scripts/version-bump.js --no-bump` |
| `fakeroot is required to finalize` | `fakeroot` assente | `apt install fakeroot` |
| La versione non avanza | marker pending di una build fallita | atteso; `--force` per forzare |
| La versione avanza di più a ogni CI run | `CI` non valorizzata sui runner | impostare `CI=1` o `ASSOCIAGO_NO_BUMP=1` |
| Permessi errati nel `.deb` | lettura dei modi con `fs.stat` sotto fakeroot | leggerli con `find` (§5.5) |
| `changelog: parse error` | data RFC 2822 malformata in `release-history.json` | verificare giorno della settimana e fuso |
