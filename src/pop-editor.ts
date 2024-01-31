import { LitElement, css, html } from "lit";
import interact from 'interactjs'
import { customElement, property, state } from "lit/decorators.js";
import { PDFDocumentProxy, GlobalWorkerOptions, getDocument, PageViewport } from "pdfjs-dist";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';


@customElement('pop-editor')
export class PopEditor extends LitElement {
  static styles = css`
  :host {
    display: block; 
    margin: 0;
    padding: 0;
  }

  .draggable {
    position: absolute;
    /* width: 30px;
    height: 30px; */
    padding: 0.25rem;
    border: 1px solid #29e;
    color: #29e;
  }

  #the-canvas {
    border: 1px solid black;
  }

  .context-menu {
    display: none;
    position: absolute;
    z-index: 10;
    border: 1px solid black;
    background-color: white;
    border-radius: 4px;
  }
  .menu-items {
    display: flex;
    flex-direction: column;
    border-radius: 4px;
  }
  .menu-item {
    padding: .5rem;
  }
  .menu-item:hover {
    border-radius: 4px;
    background-color: black;
    color: white;
  }
  .context-menu button {
    all: unset;
    display: block;
    /* background: gainsboro; */
  }
  .context-menu .action {
    display: none;
  }
  `

  @property() data: any;
  @property() url: string = ''; 
  @property({type: Array}) fields: string[] = ['abc'];

  @property({type: Number}) scale = 1;
  @property({type: Number}) rotation = 0;
  @property({type: Number}) pageNum = 1; //must be number
  @property({type: Number}) totalPage = 0;

  hostClientHeight: number | undefined;
  hostClientWidth: number | undefined;

  configNodes: any = {};
  selectedConfigNode: any = {};
  selectedAction: string = '';

  canvas: any;
  page_num = 0;
  pageCount = 0;
  pdfDoc: PDFDocumentProxy | undefined;
  pageRendering = false;
  pageNumPending: number | undefined;
  pages = [];
  
  @state() isInitialised = false;
  @state() position = { x: 0, y: 0 };
  @state() positions: Record<string, {x: number, y: number}> = {};
  @state() viewport: PageViewport | undefined;

  readonly minScale = 1.0;
  readonly maxScale = 2.3;

  constructor() {
    super();
    GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
    
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        this._closeContextMenu(e);
      }
    });
  }
  
  connectedCallback(): void {
    super.connectedCallback()
    this.initialLoad();

    this.fields.forEach((field) => {
      this.configNodes[field] = {
        "key": field,
        "type": "text",
        "fontSize": 9,
        "fontFamily": "courier",
        "position": {
          "x": 0,
          "y": 0
        },
      }
    })
  }
  
  renderPage(num: number) {
    this.pageRendering = true;
    // Using promise to fetch the page
    console.log('rendering...');

    if (!this.pdfDoc) {
      return;
    }

    this.pdfDoc.getPage(num).then((page) => {
      this.viewport = page.getViewport({ scale: this.scale, rotation: this.rotation });
      const viewport = this.viewport;
      if (!this.shadowRoot) {
        return;
      }
      this.canvas = this.shadowRoot.getElementById('the-canvas');
      const canvasContext = this.canvas.getContext("2d");
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      // Render PDF page into canvas context
      const renderContext = {
        canvasContext,
        viewport,
      };
      const renderTask = page.render(renderContext);

      // Wait for rendering to finish
      renderTask.promise.then(() => {
        console.log('Page rendered')
        
        this.fields.forEach((field) => {
          this.positions[field] = JSON.parse(JSON.stringify(this.position));
          this.dragField(field)
        });
      });
    });
  };

  dragField(className: string) {
    interact(`.${className}`).draggable({
      listeners: {
        start: (_event) => {
          // console.log(event.type, event.target)
        },
        move: (event) => {
          this.positions[className].x += event.dx
          this.positions[className].y += event.dy
    
          event.target.style.transform =
            `translate(${this.positions[className].x}px, ${this.positions[className].y}px)`
        },
        end: (_event) => {
          const pos = this.getCoordinates(JSON.parse(JSON.stringify(this.positions[className])));
          if (className.includes('-copy')) {
            const originalNode = className.replace(/-copy\d/,'');
            this.configNodes[originalNode].positions[className] = pos; 
            console.log(originalNode);
          } else {
            this.configNodes[className]['position'] = pos;
          }          
        }
      }
    })
  }

  queueRenderPage(num: number) {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  };

  initialLoad() {
    const loadingTask = getDocument({
      ...(this.url && { url: this.url }),
      ...(this.data && { data: this.data }),
    });

    loadingTask.promise
      .then(async (pdfDoc_: PDFDocumentProxy) => {
        this.pdfDoc = pdfDoc_;
        this.isInitialised = true;
        // trigger update
        this.queueRenderPage(this.pageNum);
      })
  };

  getCoordinates(pos: {x: number, y: number}) {
    console.log(pos)
    if (this.viewport && this.viewport?.viewBox?.length > 0) {
      const [x, y, width, height] = this.viewport?.viewBox;
      console.log(x,y);
      pos.y = (height - ((pos.y * height) / this.viewport?.height)) - 10;
      pos.x = (pos.x * width) / this.viewport?.width;
    }
    return pos
  }

  async modifyPdf() {
    const url = this.url;
    const existingPdfBytes = await fetch(url).then(res => res.arrayBuffer());
  
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize()
    console.log(width,height);
    for (const field of this.fields) {
      // const pos = this.getCoordinates(JSON.parse(JSON.stringify(this.positions[field])));
      try {
        if (this.configNodes[field]?.type == 'multiple') {
          for (const position of Object.values<{x:number, y:number}>(this.configNodes[field].positions)) {
            firstPage.drawText('This text was added with JavaScript!', {
              x: position?.x,
              y: position?.y,
              size: this.configNodes[field].fontSize,
              font: helveticaFont,
              color: rgb(0.95, 0.1, 0.1),
              // rotate: degrees(-45),
            })
          }
        }
        firstPage.drawText('This text was added with JavaScript!', {
          x: this.configNodes[field].position.x,
          y: this.configNodes[field].position.y,
          size: this.configNodes[field].fontSize,
          font: helveticaFont,
          color: rgb(0.95, 0.1, 0.1),
          // rotate: degrees(-45),
        })
      } catch (e) {}
    }
  
    const pdfBytes = await pdfDoc.saveAsBase64()
    return pdfBytes;
  }

  private async _display(_e: Event) {
    console.log('here in the display function');
    const data = await this.modifyPdf();
    const blob = new Blob([data]);
    const options = {
      detail: {data, blob},
      bubbles: true,
      composed: true
    };
    this.dispatchEvent(new CustomEvent('modified', options));
  }

  private async _download(_e: Event) {
    const data = await this.modifyPdf();
    const blob = new Blob([data]);

    if (this.shadowRoot) {
      const a = document.createElement('a');
      this.shadowRoot.append(a);
      a.download = 'abc.pdf';
      a.href = URL.createObjectURL(blob);
      a.click();
      a.remove();
    }
  }

  private _generateConfig(_e: Event) {
    const nodes = []
    for (const node of Object.values<any>(this.configNodes)) {
      try {
        if (node.type == "multiple") {
          const newNode = JSON.parse(JSON.stringify(node));
          delete newNode.positions;
          delete newNode.copy;
          newNode.positions = Object.values<{x: number, y: number}[]>(node.positions).map((position) => position)
          newNode.positions.push(JSON.parse(JSON.stringify(node.position)));
          delete newNode.position
          nodes.push(newNode);
        } else {
          nodes.push(node);
        }
      } catch (e) {}
    }
    const options = {
      detail: {nodes},
      bubbles: true,
      composed: true
    };
    this.dispatchEvent(new CustomEvent('pdfConfig', options));
  }

  _dragBoxContextMenu(e: PointerEvent, field: string) {
    e.preventDefault();

    this.selectedConfigNode = this.configNodes[field];

    if (!this.shadowRoot) return;
    const menu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    if (!menu) return;

    menu.style['display'] = "block";
    menu.style['position'] = "absolute";
    
    const menuPosition = this.getPosition(e);
    menu.style['top'] = menuPosition.y + "px";
    menu.style['left'] = menuPosition.x + "px";
    this.requestUpdate();
    
  }

  getPosition(e: PointerEvent) {
    let posX = 0;
    let posY = 0;
    if (!e) e = window.event as PointerEvent;
    if (e.pageX || e.pageY) {
      posX = e.pageX;
      posY = e.pageY;
    } else if (e.clientX || e.clientY) {
      posX = e.clientX + document.body.scrollLeft + 
        document.documentElement.scrollLeft;
      posY = e.clientY + document.body.scrollTop +
        document.documentElement.scrollTop;
    }
    return {
      x: posX,
      y: posY
    }
  }

  _closeContextMenu(_e: Event) {
    if (!this.shadowRoot) return;
    const menu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    if (!menu) return;
    menu.style['display'] = "none";
  }

  _contextSetFont(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!this.shadowRoot) return;
    const action = this.shadowRoot.querySelector<HTMLElement>('.context-menu .action');
    if (!action) return;
    
    const input = action.querySelector('input');
    if (!input) return;
    input.value = this.selectedConfigNode.fontSize;
    action.style['display'] =  "block"
  }

  _multiPositions(e: PointerEvent){
    e.preventDefault();
    e.stopPropagation();
    
    
    if (!this.selectedConfigNode?.copy) {
      this.selectedConfigNode.copy = 1;
    } else {
      this.selectedConfigNode.copy++;
    }

    const newFieldKey = this.selectedConfigNode.key + '-copy' + this.selectedConfigNode.copy;
    this.selectedConfigNode.type = 'multiple';
    this.positions[newFieldKey] = JSON.parse(JSON.stringify(this.position));
    this.fields.push(newFieldKey);
    this.selectedConfigNode.positions = {};
    this.selectedConfigNode.positions[newFieldKey] = (this.selectedConfigNode.position);
    
    // console.log('multi positions', this.selectedConfigNode);
    // console.log('new duplicate field added', this.configNodes);

    this.dragField(newFieldKey);
    this.requestUpdate();
    if(!this.shadowRoot) return;
    const menu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    if (!menu) return;
    menu.style['display'] = "none";
  }

  _set(e: Event) {
    console.log(e)
    if (!this.shadowRoot) return;
    const input = this.shadowRoot.querySelector<HTMLInputElement>('.context-menu .action input');
    if (!input) return;
    this.selectedConfigNode['fontSize'] = +input.value;
    const menu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    if (!menu) return;
    menu.style['display'] = "none";
    // this._closeContextMenu(e);
  }

  // Render the UI as a function of component state
  render() {
    return html`
      <div class="context-menu">
        <div class="menu-items">
          <button @click=${this._closeContextMenu}> Close </button>
          <button class="menu-item" @click="${this._contextSetFont}">Set Font Size</button>
          <button class="menu-item">Set Remove</button>
          <button class="menu-item">Set Color</button>
          <button class="menu-item" @click="${this._multiPositions}">Set Multi</button>
          <button class="menu-item">Set more attributes</button>
        </div>

        <div class="action">
          <input >
          <button @click="${this._set}">Set</button>
        </div>
      </div>

      ${
        this.fields.map((field) => html`
          <div class="draggable ${field}" @contextmenu=${{handleEvent: (e:PointerEvent) => this._dragBoxContextMenu(e, field)}}>
          ${field}
          </div>
        `)
      }
      <canvas id="the-canvas"></canvas>
      <button @click="${this._download}">Download</button>
      <button @click="${this._display}">Display</button>
      <button @click="${this._generateConfig}">Generate Config</button>
      
    `;
  }
}