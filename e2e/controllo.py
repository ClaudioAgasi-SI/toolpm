"""
Prova nel browser del Controllo (fase 3): invio e ritiro delle ore (blocco D1); approvazioni e chiusura dei mesi
si aggiungono con i blocchi successivi.

Prima: database preparato con backend/scripts/e2e-prepara.mjs, backend e frontend avviati (e2e/README.md).
Uso:  python3 e2e/controllo.py            (BASE=http://localhost:4201/toolpm, CHROME=/usr/bin/google-chrome)

Lavora sulla settimana scorsa di rita (assegnata ad ALFA/SVI, allocata su BETA). Password: Password-e2e-1.
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

    browser.close()
    print('Prova del Controllo superata.')
