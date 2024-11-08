import {micromark} from 'https://esm.sh/micromark@3?bundle'
import {gfm, gfmHtml} from 'https://esm.sh/micromark-extension-gfm@3?bundle'
import {math, mathHtml} from 'https://esm.sh/micromark-extension-math@3?bundle'

function parse(md) {
    const html = micromark(md, {
        extensions: [gfm(), math()],
        htmlExtensions: [gfmHtml(), mathHtml()]
    })

    const doc = (new DOMParser()).parseFromString(html, 'text/html')
    const type = []
    const actions = []

    let state = 'type';
    const iter = Array.from(doc.body.children)
    while(iter.length > 0) {
        const el = iter.shift()
        switch(state) {
            case 'type':
                if (el.nodeName === 'UL') {
                    type.push(...Array.from(el.children).map(li => {
                        const def = li.textContent
                        const [lhs, rhs] = def.split('=').map(x => x.trim())
                        const [scope, label] = lhs.split('/').map(x => x.trim())
                        const values = rhs.split('|').map(x => x.trim())
                        let v, axis;
                        if (values.length > 0) {
                            [v, axis] = values.at(-1).split('@')
                            values[values.length - 1] = v.trim()
                        }                                
                        return [label ? scope : null, label ?? scope, values, axis]
                    }))
                    state = 'actions'
                }
                break;
            case 'actions':
                if (el.nodeName === 'H2') {
                    actions.push({ label: el.textContent })
                }
                else if (el.nodeName === 'P') {
                    const an = el.querySelector('.math annotation')
                    if (an) {
                        const m = an.textContent.match(/^\((.*)\)\s*\\to\s*\((.*)\)\s*$/)
                        if (m) {
                            const last = actions.at(-1)
                            last.from = m[1].split(',').map(s => s.trim()).map(s => s === '\\_' ? '_' : s).map(s => {
                                let op = 'or'
                                if (s.startsWith('!')) {
                                    op = 'nor'
                                    s = s.substring(1)
                                }
                                return [op, ...s.split('|').map(x => x.trim())]
                            })
                            last.to = m[2].split(',').map(s => s.trim()).map(s => s === '\\_' ? '_' : s).map(s => {
                                let op = 'or'
                                if (s.startsWith('!')) {
                                    op = 'nor'
                                    s = s.substring(1)
                                }
                                return [op, ...s.split('|').map(x => x.trim())]
                            })
                        }
                    }
                    else {
                        const last = actions.at(-1)
                        if (last && last.comment === undefined) {
                            last.comment = el.textContent
                        }
                    }
                }
                break;
            default:
                throw 'not implemented'
        }
    }

    return [type, actions, html]
}

function render(parent, doms) {
    for (const [tag, attr, children] of doms) {
        const el = document.createElement(tag);
        if (attr != null) {
            for (const [key, value] of Object.entries(attr)) {
                el.setAttribute(key, value);
            }
        }
        if (Array.isArray(children)) {
            render(el, children)
        }
        else {
            el.textContent = children;
        }
        parent.appendChild(el);
    }
}

function setup(){
    for (const el of document.querySelectorAll('[data-state] > button'))
    {
        el.addEventListener('click', initArrow, { once: true })
        el.addEventListener('click', toggleArrow)
    }
}

function initArrow() {
    for (const div of document.querySelectorAll(`[data-from="${this.parentElement.dataset.state}"][data-label="${this.textContent}"]`)){
        const f = this;
        const t = document.querySelector(`[data-state="${div.dataset.to}"]`);
        const fr = f.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const fx = window.scrollX + fr.left + fr.width / 2;
        const fy = window.scrollY + fr.top + fr.height / 2;
        const tx = window.scrollX + tr.left + tr.width / 2;
        const ty = window.scrollY + tr.top + tr.height / 2;
        const dx = tx - fx;
        const dy = ty - fy;
        const d = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
        const th = Math.atan2(dy, dx);
        div.style.width = d + 'px';
        div.style.transform = `rotate(${th}rad)`;
        div.style.left = fx + 'px';
        div.style.top = fy + 'px';
    }
}

function toggleArrow() {
    if (this.dataset.checked !== 'true') {
        for (const arrow of document.querySelectorAll(`[data-from="${this.parentElement.dataset.state}"][data-label="${this.textContent}"]`)){
            arrow.classList.add('--active');
            for (const act of document.querySelectorAll(`[data-state="${arrow.dataset.to}"]`)) {
                act.classList.add('--attention');
            }
            document.getElementById(arrow.dataset.popover)?.showPopover();
        }
        this.dataset.checked = 'true';
    }
    else {
        for (const arrow of document.querySelectorAll(`[data-from="${this.parentElement.dataset.state}"][data-label="${this.textContent}"]`)){
            arrow.classList.remove('--active');
            for (const act of document.querySelectorAll(`[data-state="${arrow.dataset.to}"]`)) {
                act.classList.remove('--attention');
            }
            document.getElementById(arrow.dataset.popover)?.hidePopover();
        }
        this.dataset.checked = 'false';
    }
}

const worker = new Worker('./worker.js', { type: 'module' })

let _parent
worker.onmessage = (e) => {
    const doms = e.data[0];

    if (_parent) {
        render(_parent, doms)
        setup()
    }
}

export function make(parent, md, classPrefix) {
    const [type, actions, html] = parse(md, classPrefix)

    _parent = parent;
    worker.postMessage([type, actions, classPrefix])
    
    const doc = classPrefix + 'doc';
    document.getElementById(doc)?.remove()
    parent.insertAdjacentHTML('afterend', `<section id="${doc}">${html}</section>`);
}
