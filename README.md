# Ambiguo Dashboard — prototipo locale semplificato

Dashboard locale per gestire la cantina Ambiguo in modo manuale e veloce.

Questa versione è stata semplificata rispetto alla prima impostazione: niente PDF, niente login, niente cloud, niente database online. Tutto gira in locale sul Mac e salva i dati nel browser tramite `localStorage`.

## Cosa contiene

```text
ambiguo-dashboard/
├── index.html
├── styles.css
├── storage.js
├── app.js
├── README.md
└── assets/
    └── logo-ambiguo.jpeg
```

## Funzioni principali

- Dashboard minimale con grafici su:
  - bottiglie in cantina;
  - valore cantina no IVA;
  - valore cantina con IVA;
  - ordini registrati;
  - andamento valore cantina;
  - entrate / uscite bottiglie;
  - spesa ordini per mese;
  - acquisti per distributore.
- Cantina manuale con campi:
  - codice;
  - nome vino;
  - cantina;
  - annata;
  - dimensione;
  - tag: bianco, rosso, orange, rosato, bolla;
  - distributore;
  - prezzo no IVA;
  - IVA;
  - quantità;
  - note.
- Calcoli automatici:
  - IVA per bottiglia;
  - prezzo con IVA per bottiglia;
  - totale no IVA per quantità;
  - totale con IVA per quantità.
- Ordini manuali con selezione distributore.
- Distributori iniziali:
  - Etica Distribuzione;
  - Sun Import;
  - Triple A;
  - Natives.
- Possibilità di aggiungere nuovi distributori.
- Movimenti manuali di magazzino tracciati nello storico.
- Esportazione CSV della cantina.
- Backup JSON completo.
- Ripristino JSON.
- Dati demo caricabili e rimovibili.

## Come avviarla su Mac

1. Scarica ed estrai lo ZIP.
2. Sposta la cartella `ambiguo-dashboard` dove preferisci, per esempio sulla Scrivania.
3. Apri Terminale.
4. Entra nella cartella:

```bash
cd ~/Desktop/ambiguo-dashboard
```

Se l’hai salvata altrove, trascina la cartella nel Terminale dopo `cd `.

5. Avvia il server locale:

```bash
python3 -m http.server 8000
```

6. Apri il browser e vai a:

```text
http://localhost:8000
```

## Salvataggio dati

I dati vengono salvati automaticamente nel browser, dentro `localStorage`.

Questo significa che:

- restano disponibili anche se chiudi la pagina;
- sono legati al browser e all’indirizzo `localhost:8000`;
- se cancelli cache/dati del sito, puoi perderli;
- conviene fare spesso backup JSON.

## Backup

Vai in `Impostazioni` e clicca:

```text
Scarica backup JSON
```

Verrà scaricato un file tipo:

```text
ambiguo-backup-2026-07-28.json
```

Il backup contiene:

- vini;
- ordini;
- distributori;
- movimenti;
- impostazioni.

## Ripristino

Vai in `Impostazioni`, clicca:

```text
Ripristina backup JSON
```

Seleziona il file `.json` salvato in precedenza.

## Dati demo

In `Impostazioni` puoi usare:

```text
Carica dati demo
```

per provare subito grafici, cantina e ordini.

Puoi rimuoverli con:

```text
Rimuovi dati demo
```

I dati demo sono separati dai dati reali attraverso un flag interno.

## Note sulla versione attuale

Questa è una versione volutamente più semplice e manuale.

Non include più:

- lettura PDF;
- parser bolle;
- clienti;
- vendite avanzate;
- margine lordo realizzato;
- margine lordo teorico;
- valore medio vendita;
- top distributore come metrica testuale;
- giacenze basse in homepage;
- vini esauriti in homepage.

La struttura resta comunque ordinata e migrabile in futuro verso React, Next.js, Supabase o PostgreSQL.
