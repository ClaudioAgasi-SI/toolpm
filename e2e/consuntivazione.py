"""
Prova nel browser della Consuntivazione (fase 2, blocco C7): percorsi del controller e delle risorse.

Prima: database preparato con backend/scripts/e2e-prepara.mjs, backend e frontend avviati (e2e/README.md).
Uso:  python3 e2e/consuntivazione.py            (BASE=http://localhost:4201/toolpm, CHROME=/usr/bin/google-chrome)

La prova lavora sulla settimana scorsa. Persone: carlo (controller), rita (ruolo SVS, assegnata ad ALFA/SVI,
allocata su BETA), luca (senza ruolo, allocato su BETA). Password: Password-e2e-1.
"""
import os
import re
import time
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4201/toolpm')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SCREENSHOT = os.environ.get('SCREENSHOT', '/tmp')

oggi = (datetime.now(timezone.utc) + timedelta(hours=1)).date()  # Italia (basta per scegliere la settimana scorsa)
lunedi = oggi - timedelta(days=oggi.weekday() + 7)
SETTIMANA = lunedi.isoformat()
ANNO = lunedi.year - 1  # le tariffe valgono dal primo gennaio dell'anno prima


def passo(titolo):
    print(f'- {titolo}')


def entra(p, chi):
    p.context.clear_cookies()
    p.goto(f'{BASE}/accesso')
    p.fill('input[name=email]', f'{chi}@prova.it')
    p.fill('input[name=password]', 'Password-e2e-1')
    p.click('button[type=submit]')
    p.wait_for_url(lambda u: '/accesso' not in u)


def riga(p, testo):
    return p.locator('table.griglia tbody tr', has_text=testo)


def tariffa(p, tipologia, dal, euro, rifiutata=False):
    p.select_option('select[name=nuova-tipologia]', label=tipologia)
    p.fill('input[name=nuova-dal]', dal)
    p.fill('input[name=nuova-euro]', euro)
    p.get_by_role('button', name='Aggiungi').click()
    p.wait_for_function("() => document.querySelector('input[name=nuova-dal]').value === '' || document.querySelector('.errore')")
    if not rifiutata:
        expect(p.locator('p.errore')).to_have_count(0)


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    p = browser.new_page(viewport={'width': 1400, 'height': 1000})
    p.on('dialog', lambda d: d.accept())

    passo('controller: tipologie di costo (nuova tipologia, cambio della predefinita e ritorno)')
    entra(p, 'carlo')
    p.goto(f'{BASE}/consuntivazione/tipologie')
    p.fill('input[name=nuovo-codice]', 'REPERIBILITA')
    p.fill('input[name=nuova-descrizione]', 'Reperibilità')
    p.get_by_role('button', name='Aggiungi').click()
    voce = lambda codice: p.locator('tbody tr').filter(has=p.get_by_role('cell', name=codice, exact=True))
    voce('REPERIBILITA').get_by_role('button', name='Rendi predefinita').click()
    expect(voce('REPERIBILITA').locator('.etichetta-predefinita')).to_be_visible()
    voce('ORDINARIA').get_by_role('button', name='Rendi predefinita').click()
    expect(p.locator('.etichetta-predefinita')).to_have_count(1)

    passo('controller: tariffe standard del ruolo e personalizzata di rita')
    p.goto(f'{BASE}/consuntivazione/tariffe')
    p.locator('tr.cliccabile', has_text='SVS').click()
    tariffa(p, 'Ordinaria', f'{ANNO}-01-01', '30')
    tariffa(p, 'Straordinaria', f'{ANNO}-01-01', '39')
    tariffa(p, 'Straordinaria', f'{ANNO}-06-01', '40', rifiutata=True)  # sovrapposta: rifiutata
    expect(p.locator('p.errore')).to_contain_text('sovrapposto')
    p.get_by_role('button', name='Personalizzate per risorsa').click()
    p.select_option('select[name=risorsa]', label='Rita Prova')
    tariffa(p, 'Ordinaria', f'{ANNO}-01-01', '32')
    sezione = p.locator('section', has_text='Si applica al')
    expect(sezione.locator('tr', has_text='Ordinaria').first).to_contain_text('personalizzata')

    passo('risorsa: settimana scorsa con proposte, attività assegnata, straordinario, nota')
    entra(p, 'rita')
    inizio = time.monotonic()
    p.goto(f'{BASE}/consuntivazione/settimana?vista=settimana&data={SETTIMANA}')
    expect(riga(p, 'BETA')).to_contain_text('dal Pianificatore')
    p.select_option('select[name=voce]', label='★ ALFA › SVI — Sviluppo front end')
    p.get_by_role('button', name='Aggiungi', exact=True).click()
    for i in range(5):
        riga(p, 'ALFA › SVI').locator('td.ore input').nth(i).fill('8')
    riga(p, 'BETA').locator('select').select_option(label='Straordinaria')
    riga(p, 'BETA').locator('td.ore input').nth(2).fill('2')
    riga(p, 'ALFA › SVI').locator('td.ore input').nth(0).click()
    p.locator('.nota-cella input').fill('Avvio del portale')
    p.locator('.comandi button.primario').click()
    expect(p.locator('p.ok')).to_contain_text('Salvato: 5 giornate')
    secondi = time.monotonic() - inizio
    expect(p.locator('tfoot')).to_contain_text('42:00')
    assert '€' not in p.content(), 'la risorsa non deve vedere importi'
    p.screenshot(path=f'{SCREENSHOT}/e2e-mio-consuntivo.png', full_page=True)

    passo('risorsa: la settimana dopo si copia in un clic (solo nei giorni passati e vuoti)')
    p.get_by_role('button', name='Settimana successiva').click()
    p.get_by_role('button', name='Copia la settimana precedente').click()
    expect(p.locator('p.ok')).to_contain_text(re.compile(r'Copiate \d+ righe|Niente da copiare'))
    p.goto(f'{BASE}/consuntivazione/tariffe')
    expect(p).to_have_url(re.compile(r'/toolpm/$'))  # pagina del controller: rimandata alla home

    passo('risorsa senza ruolo: ore salvate, costo da valorizzare')
    entra(p, 'luca')
    p.goto(f'{BASE}/consuntivazione/settimana?vista=giorno&data={(lunedi + timedelta(days=1)).isoformat()}')
    riga(p, 'BETA').locator('td.ore input').first.fill('4')
    p.locator('.comandi button.primario').click()
    expect(p.locator('p.ok')).to_contain_text('Salvato: 1 giornata')

    passo('controller: consuntivi delle risorse con i costi')
    entra(p, 'carlo')
    p.goto(f'{BASE}/consuntivazione/consuntivi-risorse?data={SETTIMANA}')
    p.select_option('select[name=risorsa]', label='Rita Prova')
    # 40 ore ordinarie a 32 €/h (personalizzata) + 2 ore straordinarie a 39 €/h (standard)
    expect(p.locator('tfoot')).to_contain_text('1358,00 €')
    expect(p.get_by_text('(personalizzata)').first).to_be_visible()

    passo('controller: righe da valorizzare e ricalcolo dopo una correzione di tariffa')
    p.goto(f'{BASE}/consuntivazione/da-valorizzare')
    expect(p.locator('tr', has_text='Luca Prova')).to_contain_text('La risorsa non ha un ruolo alla data')
    p.select_option('select[name=risorsa]', label='Rita Prova')
    p.get_by_role('button', name='Anteprima').last.click()
    expect(p.locator('.riepilogo')).to_contain_text('Nessuna riga cambierebbe')
    p.goto(f'{BASE}/consuntivazione/tariffe?vista=personalizzate')
    p.select_option('select[name=risorsa]', label='Rita Prova')
    p.locator('app-elenco-tariffe tbody tr').filter(has=p.get_by_role('button', name='Modifica')).first.get_by_role('button', name='Modifica').click()
    p.fill('input[name=euro]', '33')
    p.get_by_role('button', name='Salva').click()
    expect(p.locator('p.errore')).to_have_count(0)
    p.goto(f'{BASE}/consuntivazione/da-valorizzare')
    p.select_option('select[name=risorsa]', label='Rita Prova')
    p.get_by_role('button', name='Anteprima').last.click()
    expect(p.locator('.riepilogo')).to_contain_text('5 righe')
    p.get_by_role('button', name='Applica il ricalcolo').click()
    expect(p.locator('p.ok')).to_contain_text('Ricalcolo applicato a 5 righe')
    p.goto(f'{BASE}/consuntivazione/consuntivi-risorse?data={SETTIMANA}')
    p.select_option('select[name=risorsa]', label='Rita Prova')
    expect(p.locator('tfoot')).to_contain_text('1398,00 €')  # 40 × 33 + 2 × 39
    p.screenshot(path=f'{SCREENSHOT}/e2e-consuntivi-risorse.png', full_page=True)

    browser.close()
    print(f'Prova della Consuntivazione superata (settimana di rita compilata e salvata in {secondi:.0f} s di automazione).')
