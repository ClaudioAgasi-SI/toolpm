"""
Prova nel browser dei Report (fase 4, blocco E7): andamento (Esegui ora), elenco dei progetti e scheda con gli
indicatori EVM e l'andamento, esportazione in Excel, riservatezza degli euro per il TL, report dei costi per centro di
costo, righe di dettaglio in CSV, pianificato e consuntivato.

Prima: database preparato con backend/scripts/e2e-prepara.mjs E POI backend/scripts/e2e-report.mjs (ore approvate
con i costi), backend e frontend avviati (e2e/README.md). Il backend con EVM_RECUPERO_ALL_AVVIO=false, così
l'andamento lo calcola la prova con "Esegui ora".
Uso:  python3 e2e/report.py            (BASE=http://localhost:4201/toolpm, CHROME=/usr/bin/google-chrome)

Richiede openpyxl (pip install openpyxl) per leggere l'Excel scaricato.
"""
import csv
import io
import os
import re
from datetime import date, datetime, timedelta, timezone

import openpyxl
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:4201/toolpm')
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SCREENSHOT = os.environ.get('SCREENSHOT', '/tmp')

# Oggi in Italia (come il backend) e gli stessi giorni di e2e-report.mjs.
oggi = datetime.now(timezone.utc).astimezone(__import__('zoneinfo').ZoneInfo('Europe/Rome')).date()
giorni = [oggi - timedelta(days=n) for n in range(60, 13, -1) if (oggi - timedelta(days=n)).weekday() < 5]
N = len(giorni)
ORE_RITA = (N - 2) * 8  # approvate; le ultime due in attesa
ORE_TITO = N * 4
ORE_ALFA = ORE_RITA + ORE_TITO
EURO_ALFA = (N - 2) * 320 + N * 200
DAL = (oggi - timedelta(days=70)).isoformat()

# Stati attesi oggi per ALFA: stima definitiva 40 gg / 16.000 €, 25% completato, dal 1/1 dell'anno scorso al 31/12 di quest'anno.
inizio = date(oggi.year - 1, 1, 1)
fine = date(oggi.year, 12, 31)
quota = (oggi - inizio).days / (fine - inizio).days
SPI = round(0.25 / quota, 2)
CPI = round(0.25 * 16000 / EURO_ALFA, 2)


def stato(indice, tempi):
    nomi = ['In anticipo', 'In linea', 'In ritardo', 'In forte ritardo'] if tempi else ['Sotto budget', 'In linea', 'Sopra budget', 'Fortemente sopra budget']
    return nomi[0] if indice >= 1.05 else nomi[1] if indice >= 0.95 else nomi[2] if indice >= 0.85 else nomi[3]


def ore(h):
    return f'{h}:00'


def euro(e):
    return f'{e:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.') + ' €'


def passo(titolo):
    print(f'- {titolo}')


def entra(p, chi):
    p.context.clear_cookies()
    p.goto(f'{BASE}/accesso')
    p.fill('input[name=email]', f'{chi}@prova.it')
    p.fill('input[name=password]', 'Password-e2e-1')
    p.click('button[type=submit]')
    p.wait_for_url(lambda u: '/accesso' not in u)


def scarica(p, pulsante, voce):
    """Apre il menu di un pulsante "Scarica" e restituisce (nome del file, percorso salvato)."""
    pulsante.locator('button').first.click()
    with p.expect_download() as d:
        pulsante.locator('.menu button', has_text=voce).click()
    file = d.value
    percorso = os.path.join(SCREENSHOT, file.suggested_filename)
    file.save_as(percorso)
    return file.suggested_filename, percorso


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME or None)
    p = browser.new_context(accept_downloads=True, viewport={'width': 1400, 'height': 1000}).new_page()
    p.set_default_timeout(15000)

    passo(f'controller: Esegui ora calcola l\'andamento ({N} giorni lavorativi di ore, AC {euro(EURO_ALFA)})')
    entra(p, 'carlo')
    p.goto(f'{BASE}/consuntivazione/periodi')
    riquadro = p.locator('app-esecuzioni-andamento')
    expect(riquadro).to_contain_text('non è ancora stata eseguita')
    riquadro.get_by_role('button', name='Esegui ora').click()
    expect(riquadro.locator('dl')).to_contain_text('Completata', timeout=60000)
    ieri = (oggi - timedelta(days=1)).strftime('%d/%m/%Y')
    expect(riquadro).to_contain_text(f'Dati aggiornati al {ieri}')

    passo(f'PM: elenco dei progetti con gli stati di tempi ({stato(SPI, True)}) e costi ({stato(CPI, False)})')
    entra(p, 'pina')
    p.goto(f'{BASE}/consuntivazione/progetti')
    alfa = p.locator('table.elenco tbody tr', has_text='ALFA')
    expect(alfa).to_contain_text(stato(SPI, True))
    expect(alfa).to_contain_text(stato(CPI, False))
    expect(alfa).to_contain_text(euro(EURO_ALFA))

    passo('PM: scheda di ALFA con indicatori, spiegazione e andamento nei grafici')
    alfa.get_by_role('link').first.click()
    p.fill('input[name=da]', DAL)
    p.get_by_role('button', name='Aggiorna').click()
    dal_it = (oggi - timedelta(days=70)).strftime('%d/%m/%Y')
    expect(p.locator('section[aria-label="Stime e consuntivato"]')).to_contain_text(f'Nel periodo dal {dal_it}')
    evm = p.locator('app-evm-progetto')
    expect(evm.locator('.stati')).to_contain_text(stato(SPI, True))
    expect(evm.locator('.stati')).to_contain_text(stato(CPI, False))
    expect(evm.locator('.spiegazione')).to_contain_text(f'SPI {SPI:.2f}'.replace('.', ','))
    expect(evm.locator('table.indicatori')).to_contain_text(euro(EURO_ALFA))
    andamento = p.locator('app-andamento-evm')
    expect(andamento).to_contain_text(f'Andamento aggiornato al {ieri}')
    expect(andamento.locator('app-grafico-linee')).to_have_count(2)
    expect(andamento.locator('app-grafico-linee').first.locator('path')).to_have_count(3)
    p.screenshot(path=f'{SCREENSHOT}/e2e-report-scheda.png', full_page=True)

    passo('PM: scarica la scheda in Excel, con i costi del periodo')
    nome, percorso = scarica(p, p.locator('header app-pulsante-scarica'), 'Excel')
    assert re.fullmatch(r'toolpm-progetto-alfa-\d{4}-\d{2}-\d{2}\.xlsx', nome), nome
    libro = openpyxl.load_workbook(percorso)
    assert libro.sheetnames == ['Riepilogo', 'Attività', 'Risorse', 'Ruoli', 'Tipologie', 'Mesi'], libro.sheetnames
    riepilogo = {r[0]: r[1:] for r in libro['Riepilogo'].iter_rows(values_only=True) if r and r[0]}
    assert riepilogo['Consuntivato nel periodo'][1] == EURO_ALFA, riepilogo['Consuntivato nel periodo']
    risorse = {r[0]: r[1] for r in libro['Risorse'].iter_rows(values_only=True) if r and r[0] in ('Rita Prova', 'Tito Prova')}
    assert risorse == {'Rita Prova': ORE_RITA, 'Tito Prova': ORE_TITO}, risorse

    passo('TL: scheda, report e file senza euro')
    entra(p, 'tito')
    p.goto(f'{BASE}/consuntivazione/progetti')
    p.locator('table.elenco tbody tr', has_text='ALFA').get_by_role('link').first.click()
    expect(p.locator('app-evm-progetto .stati')).to_contain_text(stato(SPI, True))
    expect(p.locator('app-andamento-evm')).to_contain_text('giorni')
    assert '€' not in p.locator('main, body').first.inner_text()
    p.goto(f'{BASE}/consuntivazione/report/costi')
    p.fill('input[name=da]', DAL)
    p.get_by_role('button', name='Aggiorna').click()
    expect(p.locator('table.albero tfoot')).to_contain_text(ore(ORE_ALFA))
    assert '€' not in p.locator('body').inner_text()
    _, percorso = scarica(p, p.locator('app-pulsante-scarica').first, 'CSV')
    testo = open(percorso, encoding='utf-8-sig').read()
    assert 'Costo' not in testo and '€' not in testo, testo[:400]

    passo(f'controller: report per centro di costo › progetto › attività ({ore(ORE_ALFA)} su ALFA)')
    entra(p, 'carlo')
    p.goto(f'{BASE}/consuntivazione/report/costi')
    p.fill('input[name=da]', DAL)
    p.get_by_role('button', name='Aggiorna').click()
    # Aspetta il report del nuovo periodo prima di espandere (il ricaricamento richiude l'albero).
    expect(p.locator('table.albero tfoot')).to_contain_text(ore(ORE_ALFA))
    p.get_by_role('button', name='Espandi tutto').click()
    albero = p.locator('table.albero')
    expect(albero.locator('tbody tr', has_text='CDC-SVI')).to_contain_text(ore(ORE_ALFA))
    expect(albero.locator('tbody tr', has_text='CDC-SVI')).to_contain_text(euro(EURO_ALFA))
    expect(albero.locator('tbody tr', has_text='SVI — Sviluppo front end')).to_contain_text(ore(ORE_RITA))
    expect(albero.locator('tbody tr', has_text='Senza attività')).to_contain_text(ore(ORE_TITO))
    expect(p.locator('.avviso')).to_contain_text('2 righe (16:00 h) del periodo non ancora approvate')
    p.screenshot(path=f'{SCREENSHOT}/e2e-report-costi.png', full_page=True)

    passo(f'controller: righe di dettaglio in CSV ({2 * N - 2} righe approvate)')
    nome, percorso = scarica(p, p.locator('app-pulsante-scarica').nth(1), 'CSV')
    assert nome.startswith('toolpm-righe-') and nome.endswith('.csv'), nome
    righe = list(csv.reader(io.StringIO(open(percorso, encoding='utf-8-sig').read()), delimiter=';'))
    tabella = righe[righe.index([]) + 1:] if [] in righe else righe[6:]
    assert tabella[0][:3] == ['Data', 'Risorsa', 'Ruolo'], tabella[0]
    assert len(tabella) - 1 == 2 * N - 2, len(tabella)
    rita = next(r for r in tabella if r[1] == 'Rita Prova')
    assert rita[3:6] == ['ALFA', 'Portale clienti', 'SVI — Sviluppo front end'] and rita[8] == '8' and rita[9] == '40' and rita[10] == '320', rita

    passo('controller: pianificato e consuntivato, con le ore su ALFA non allocate')
    p.goto(f'{BASE}/consuntivazione/report/pianificato')
    p.fill('input[name=da]', giorni[0].strftime('%Y-%m'))
    p.fill('input[name=a]', oggi.strftime('%Y-%m'))
    p.get_by_role('button', name='Aggiorna').click()
    tabella = p.locator('table.griglia-pian')
    expect(tabella.locator('tr.risorsa', has_text='Rita Prova')).to_be_visible()
    if not tabella.locator('tr.progetto', has_text='ALFA').count():
        tabella.locator('tr.risorsa', has_text='Rita Prova').locator('button.apri').click()
    expect(tabella.locator('tr.progetto', has_text='ALFA').first).to_contain_text('non allocata')
    expect(tabella.locator('tr.progetto', has_text='BETA').first).to_contain_text('50%')
    p.screenshot(path=f'{SCREENSHOT}/e2e-report-pianificato.png', full_page=True)

    browser.close()
    print('Prova dei Report superata.')
