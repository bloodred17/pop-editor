import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";


@customElement('object-entry')
export class ObjectEntry extends LitElement {
  static styles = css`
    .ob-container {
      width: 100px;
    }
  `

  @property({ type: Array })
  entries: string[] = [];
  
  @state()
  _submitEnabled = false;

  @query('input')
  _input!: HTMLInputElement;

  _addEntry(_e: Event) {
    const name = this._input.value;
    this._input.value = '';
    this._submitEnabled = false;
    this.entries.push(name );
  }

  _inputChanged(e: Event) {
    this._submitEnabled = !!(e.target as HTMLInputElement).value;
  }

  _removeEntry(index: number) {
    this.entries.splice(index, 1);
    this.requestUpdate();
  }

  render() {
    return html`
    <div class="ob-container">
      <div>
        <input @input=${this._inputChanged} />
        <button @click="${this._addEntry}"> + </button>
        <button> - </button>
      </div>
      <ul>
        ${
          repeat(this.entries, (entry) => entry, (entry, index) => {
            return html`<li>${entry} <button @click="${{handleEvent: () => this._removeEntry(index)}}"> - </button> </li>`
          })
        }
      </ul>
    </div>
    `
  }
}