"""
Prova nel browser del Controllo (fase 3): invio e ritiro delle ore (blocco D1), approvazioni (D3),
chiusura e riapertura dei mesi (D4), storico e cronologia delle righe (D5).

Prima: database preparato con backend/scripts/e2e-prepara.mjs, backend e frontend avviati (e2e/README.md).
Uso:  python3 e2e/controllo.py            (BASE=http://localhost:4201/toolpm, CHROME=/usr/bin/google-chrome)

Lavora sulla settimana scorsa di rita (assegnata ad ALFA/SVI, allocata su BETA). Approvatori: tito TL di ALFA,
pina PM di ALFA e BETA. Password: Password-e2e-1.
"""
import os
import re
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4201/toolpm')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SCREENSHOT = os.environ.get('SCREENSHOT', '/tmp')

oggi = (datetime.now(timezone.utc) + timedelta(hours=1)).date()
lunedi = oggi - timedelta(days=oggi.weekday() + 7)
SETTIMANA = lunedi.isoformat()
# Mesi (AAAAMM) dei giorni lavorati della settimana scorsa, in ordine.
MESI = sorted({(lunedi + timedelta(days=i)).strftime('%Y%m') for i in range(5)})


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


def celle(p, testo):
    return riga(p, testo).locator('td.ore input')


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    p = browser.new_page(viewport={'width': 1400, 'height': 1000})
    p.on('dialog', lambda d: d.accept())

    passo('risorsa: compila e salva la settimana scorsa; il pulsante Invia conta le righe in bozza')
    entra(p, 'rita')
    p.goto(f'{BASE}/consuntivazione/settimana?vista=settimana&data={SETTIMANA}')
    if not riga(p, 'ALFA › SVI').count():
        p.select_option('select[name=voce]', label='★ ALFA › SVI — Sviluppo front end')
        p.get_by_role('button', name='Aggiungi', exact=True).click()
    for i in range(5):
        celle(p, 'ALFA › SVI').nth(i).fill('8')
    invia = p.locator('button.invia')
    expect(invia).to_be_disabled()  # ore non salvate
    p.locator('.comandi button.primario').click()
    expect(p.locator('p.ok')).to_contain_text('Salvato')
    expect(invia).to_have_text(re.compile(r'Invia la settimana \(5\)'))

    passo('risorsa: invia la settimana; le celle diventano in sola lettura')
    invia.click()
    expect(p.locator('p.ok')).to_contain_text("Inviate all'approvazione: 5 righe")
    expect(celle(p, 'ALFA › SVI').first).to_be_disabled()
    expect(riga(p, 'ALFA › SVI').locator('td.ore[data-stato=inviata]')).to_have_count(5)
    expect(invia).to_be_disabled()

    passo('risorsa: una riga nuova accanto a quelle inviate, poi ritiro dell\'invio')
    p.select_option('select[name=voce]', label='★ ALFA › SVI — Sviluppo front end')
    p.select_option('select[name=tipologia]', label='Straordinaria')
    p.get_by_role('button', name='Aggiungi', exact=True).click()
    straord = p.locator('table.griglia tbody tr').filter(has=p.locator('select option:checked', has_text='Straordinaria')).filter(has_text='ALFA › SVI')
    straord.locator('td.ore input').nth(1).fill('2')
    p.locator('.comandi button.primario').click()
    expect(invia).to_have_text(re.compile(r'\(1\)'))
    p.screenshot(path=f'{SCREENSHOT}/e2e-invio.png', full_page=True)
    p.get_by_role('button', name=re.compile(r"Ritira l'invio \(5\)")).click()
    expect(p.locator('p.ok')).to_contain_text('5 righe di nuovo in bozza')
    expect(celle(p, 'ALFA › SVI').first).to_be_enabled()
    expect(invia).to_have_text(re.compile(r'\(6\)'))

    passo('risorsa: invio finale della settimana')
    invia.click()
    expect(p.locator('p.ok')).to_contain_text("Inviate all'approvazione: 6 righe")

    passo('TL: vede le 6 righe inviate, senza costi; dà il via libera alla settimana di rita')
    entra(p, 'tito')
    p.goto(f'{BASE}/consuntivazione/approvazioni')
    expect(p.locator('.sottomenu .contatore')).to_have_text('6')
    gruppo = p.locator('section.gruppo', has_text='Rita Prova')
    expect(gruppo.locator('tbody tr')).to_have_count(6)
    expect(p.locator('th', has_text='Costo')).to_have_count(0)
    gruppo.locator('h2 input[type=checkbox]').check()
    expect(p.locator('button.azione-approva')).to_have_count(0)
    p.locator('button.azione-viaLibera').click()
    expect(p.locator('p.ok')).to_contain_text('Via libera dato a: 6 righe')
    expect(p.locator('.vuoto')).to_contain_text('Nessuna riga aspetta una tua azione')

    passo('PM: respinge lo straordinario con la motivazione, approva il resto')
    entra(p, 'pina')
    p.goto(f'{BASE}/consuntivazione/approvazioni')
    righe = p.locator('section.gruppo tbody tr')
    expect(righe).to_have_count(6)
    expect(righe.first).to_contain_text('via libera: Tito Prova')
    expect(p.locator('th', has_text='Costo')).to_have_count(1)
    straordinario = righe.filter(has_text='Straordinaria')
    straordinario.locator('input[type=checkbox]').check()
    p.locator('button.azione-respingi').click()
    p.fill('textarea[name=motivazione]', 'Lo straordinario non era autorizzato: segna 1:30')
    p.get_by_role('button', name='Conferma il rifiuto').click()
    expect(p.locator('p.ok')).to_contain_text('Respinte: 1 riga')
    expect(righe).to_have_count(5)
    p.get_by_label('Seleziona tutte').check()
    p.locator('button.azione-approva').click()
    expect(p.locator('p.ok')).to_contain_text('Approvate: 5 righe')
    p.select_option('select[name=vista]', label='Approvate')
    expect(righe).to_have_count(5)
    p.screenshot(path=f'{SCREENSHOT}/e2e-approvazioni.png', full_page=True)

    passo('risorsa: vede il rifiuto, corregge e reinvia; le righe approvate restano in sola lettura')
    entra(p, 'rita')
    p.goto(f'{BASE}/consuntivazione/settimana?vista=settimana&data={SETTIMANA}')
    expect(p.locator('.respinte')).to_contain_text('non era autorizzato')
    expect(riga(p, 'ALFA › SVI').first.locator('td.ore[data-stato=approvata]')).to_have_count(5)
    straord = p.locator('table.griglia tbody tr').filter(has=p.locator('select option:checked', has_text='Straordinaria')).filter(has_text='ALFA › SVI')
    straord.locator('td.ore input').nth(1).fill('1:30')
    p.locator('.comandi button.primario').click()
    expect(p.locator('p.ok')).to_contain_text('Salvato')
    p.locator('button.invia').click()
    expect(p.locator('p.ok')).to_contain_text("Inviate all'approvazione: 1 riga")

    passo('PM: approva la riga corretta, che riparte senza via libera')
    entra(p, 'pina')
    p.goto(f'{BASE}/consuntivazione/approvazioni')
    expect(righe).to_have_count(1)
    expect(righe.first).not_to_contain_text('via libera')
    expect(righe.first).to_contain_text('1:30')
    righe.first.locator('input[type=checkbox]').check()
    p.locator('button.azione-approva').click()
    expect(p.locator('p.ok')).to_contain_text('Approvate: 1 riga')
    expect(p.locator('.sottomenu .contatore')).to_have_count(0)

    passo('controller: chiude il mese (tutte le righe approvate), la risorsa non modifica più, poi riapre')
    entra(p, 'carlo')
    p.goto(f'{BASE}/consuntivazione/periodi')
    for mese in MESI:
        riga_mese = p.locator(f'tr[data-mese="{mese}"]')
        riga_mese.get_by_role('button', name='Chiudi…').click()
        expect(p.locator('.pannello')).to_contain_text('Tutte le righe sono approvate')
        p.get_by_role('button', name='Chiudi il mese').click()
        expect(p.locator('p.ok')).to_contain_text('chiuso')
        expect(riga_mese).to_contain_text('Chiuso')
    p.screenshot(path=f'{SCREENSHOT}/e2e-periodi.png', full_page=True)
    entra(p, 'rita')
    p.goto(f'{BASE}/consuntivazione/settimana?vista=settimana&data={SETTIMANA}')
    expect(p.locator('.mese-chiuso')).to_contain_text('è chiuso')
    expect(riga(p, 'ALFA › SVI').first.locator('td.ore[data-stato=chiusa]')).to_have_count(5)
    # Anche le celle vuote del mese chiuso non si compilano.
    expect(p.locator('table.griglia tbody tr').filter(has=p.locator('select option:checked', has_text='Straordinaria')).locator('td.ore input').first).to_be_disabled()
    expect(p.locator('button.invia')).to_be_disabled()
    entra(p, 'carlo')
    p.goto(f'{BASE}/consuntivazione/periodi')
    for mese in reversed(MESI):
        p.locator(f'tr[data-mese="{mese}"]').get_by_role('button', name='Riapri…').click()
        p.fill('textarea[name=motivazioneRiapertura]', 'Correzione richiesta dal PM')
        p.get_by_role('button', name='Riapri il mese').click()
        expect(p.locator('p.ok')).to_contain_text('riaperto')
    expect(p.locator(f'tr[data-mese="{MESI[0]}"]')).to_contain_text('Correzione richiesta dal PM')

    passo('controller: lo storico mostra chiusure, riaperture, rifiuti e la correzione di rita')
    p.goto(f'{BASE}/consuntivazione/storico')
    storico = p.locator('table.elenco tbody')
    expect(storico).to_contain_text('Mese riaperto')
    expect(storico).to_contain_text('Correzione richiesta dal PM')
    p.select_option('select[name=operazione]', label='Corretta dopo il rifiuto')
    expect(storico.locator('tr')).to_have_count(1)
    expect(storico).to_contain_text('Rita Prova')
    expect(storico).to_contain_text('ore: 2:00 → 1:30')
    p.screenshot(path=f'{SCREENSHOT}/e2e-storico.png', full_page=True)

    passo('risorsa: cronologia della riga dello straordinario, senza importi')
    entra(p, 'rita')
    p.goto(f'{BASE}/consuntivazione/settimana?vista=settimana&data={SETTIMANA}')
    straord = p.locator('table.griglia tbody tr').filter(has=p.locator('select option:checked', has_text='Straordinaria')).filter(has_text='ALFA › SVI')
    straord.locator('td.ore').nth(1).click()
    p.locator('.cronologia-cella summary').click()
    cronologia = p.locator('app-cronologia-riga li')
    passaggio = lambda nome: cronologia.filter(has=p.locator('strong', has_text=re.compile(f'^{nome}$')))
    expect(passaggio('Respinta')).to_contain_text('non era autorizzato')
    expect(passaggio('Corretta dopo il rifiuto')).to_contain_text('ore: 2:00 → 1:30')
    expect(passaggio('Approvata')).to_have_count(1)
    assert '€' not in p.locator('app-cronologia-riga').inner_text()

    browser.close()
    print('Prova del Controllo superata.')
