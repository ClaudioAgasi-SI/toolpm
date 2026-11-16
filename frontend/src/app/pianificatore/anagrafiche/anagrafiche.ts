import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, messaggioErrore } from '../api.service';
import { Certificazione, Rate, Skill } from '../models';
import { ScalaEditor } from './scala-editor';

@Component({
  selector: 'app-anagrafiche',
  imports: [FormsModule, ScalaEditor],
  template: `
    <h1>Anagrafiche</h1>
    <p class="nota">
      Questi valori servono da suggerimento durante l'inserimento delle risorse: nelle risorse si possono
      usare anche valori non presenti qui.
    </p>
    @if (errore()) {
      <p class="errore">{{ errore() }}</p>
    }

    <div class="colonne">
      <section>
        <h2>Skill</h2>
        @for (tipo of tipi; track tipo) {
          <h3>{{ tipo }}</h3>
          <ul>
            @for (s of skillDiTipo(tipo); track s._id) {
              <li>{{ s.skillName }} <button type="button" class="rimuovi" (click)="eliminaSkill(s)" aria-label="Elimina">×</button></li>
            }
          </ul>
        }
        <form class="aggiungi" (ngSubmit)="aggiungiSkill()">
          <input name="skillName" placeholder="Nuova skill" [(ngModel)]="nuovaSkill.skillName" required />
          <select name="skillType" [(ngModel)]="nuovaSkill.skillType">
            @for (tipo of tipi; track tipo) {
              <option [value]="tipo">{{ tipo }}</option>
            }
          </select>
          <button type="submit">Aggiungi</button>
        </form>
      </section>

      <section>
        <h2>Certificazioni</h2>
        <ul>
          @for (c of certificazioni(); track c._id) {
            <li>{{ c.certName }} <small>{{ c.certType }}</small>
              <button type="button" class="rimuovi" (click)="eliminaCertificazione(c)" aria-label="Elimina">×</button></li>
          }
        </ul>
        <form class="aggiungi" (ngSubmit)="aggiungiCertificazione()">
          <input name="certName" placeholder="Nome" [(ngModel)]="nuovaCert.certName" required />
          <input name="certType" placeholder="Tipo" [(ngModel)]="nuovaCert.certType" />
          <button type="submit">Aggiungi</button>
        </form>
      </section>

      <section>
        <h2>Scale di valutazione</h2>
        <p class="nota">
          Valori dal livello più alto (in cima) al più basso: l'ordine serve per confrontare i livelli.
          Rinominare un valore non modifica le risorse che lo usano già.
        </p>
        @for (r of rate(); track r._id) {
          <app-scala-editor [scala]="r" (salvata)="ricarica()" />
        }
        @if (nuovaScala()) {
          <app-scala-editor [scala]="{ rateType: '', rate: [] }" (salvata)="nuovaScala.set(false); ricarica()" />
        } @else {
          <button type="button" (click)="nuovaScala.set(true)">+ Nuova scala</button>
        }
      </section>
    </div>
  `,
  styles: `
    .nota { color: var(--testo-tenue); font-size: 0.9rem; }
    .colonne { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; }
    h3 { font-size: 0.9rem; text-transform: capitalize; color: var(--testo-tenue); margin: 1rem 0 0.25rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid var(--bordo); }
    li small { color: var(--testo-tenue); margin-left: 0.5rem; flex: 1; }
    .aggiungi { display: flex; gap: 0.4rem; margin-top: 0.75rem; flex-wrap: wrap; }
    .aggiungi input { flex: 1; min-width: 6rem; }
    .rimuovi { padding: 0 8px; }
  `,
})
export class Anagrafiche {
  private readonly api = inject(ApiService);

  protected readonly tipi = ['tecnico', 'funzionale', 'ambito'];
  protected readonly skills = signal<Skill[]>([]);
  protected readonly certificazioni = signal<Certificazione[]>([]);
  protected readonly rate = signal<Rate[]>([]);
  protected readonly errore = signal('');
  protected readonly nuovaScala = signal(false);

  protected nuovaSkill: Skill = { skillName: '', skillType: 'tecnico' };
  protected nuovaCert: Certificazione = { certName: '', certType: '' };

  constructor() {
    this.ricarica();
  }

  protected skillDiTipo(tipo: string) {
    return this.skills().filter((s) => s.skillType === tipo);
  }

  protected aggiungiSkill() {
    if (!this.nuovaSkill.skillName.trim()) return;
    this.api.creaSkill(this.nuovaSkill).subscribe({
      next: () => {
        this.nuovaSkill = { skillName: '', skillType: this.nuovaSkill.skillType };
        this.ricarica();
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected eliminaSkill(s: Skill) {
    if (!s._id || !confirm(`Eliminare la skill "${s.skillName}" dall'anagrafica?`)) return;
    this.api.eliminaSkill(s._id).subscribe({
      next: () => this.ricarica(),
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected aggiungiCertificazione() {
    if (!this.nuovaCert.certName.trim()) return;
    this.api.creaCertificazione(this.nuovaCert).subscribe({
      next: () => {
        this.nuovaCert = { certName: '', certType: '' };
        this.ricarica();
      },
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected eliminaCertificazione(c: Certificazione) {
    if (!c._id || !confirm(`Eliminare la certificazione "${c.certName}" dall'anagrafica?`)) return;
    this.api.eliminaCertificazione(c._id).subscribe({
      next: () => this.ricarica(),
      error: (e) => this.errore.set(messaggioErrore(e)),
    });
  }

  protected ricarica() {
    this.errore.set('');
    this.api.skills().subscribe({ next: (s) => this.skills.set(s), error: (e) => this.errore.set(messaggioErrore(e)) });
    this.api.certificazioni().subscribe((c) => this.certificazioni.set(c));
    this.api.rate().subscribe((r) => this.rate.set(r));
  }
}
