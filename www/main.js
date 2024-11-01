import {micromark} from 'https://esm.sh/micromark@3?bundle'
import {gfm, gfmHtml} from 'https://esm.sh/micromark-extension-gfm@3?bundle'
import {math, mathHtml} from 'https://esm.sh/micromark-extension-math@3?bundle'

function wildcard(type, actions, i = 0) {
    if (i === type.length)
        return actions;

    return wildcard(type, actions.flatMap(act => {
        if (act.from[i] === '*') {
            return type[i][2].map(v => {
                const a = {
                    ...act, 
                    from: [...act.from], 
                    to: [...act.to]
                };
                a.from[i] = v;
                return a;
            })
        }
        return [act];
    }), ++i);
}

function or(type, actions, i = 0) {
    if (i === type.length)
        return actions;

    return or(type, actions.flatMap(act => {
        if (Array.isArray(act.from[i]) && act.from[i][0] === 'or') {
            return act.from[i].slice(1).map(v => {
                const a = {
                    ...act, 
                    from: [...act.from], 
                    to: [...act.to]
                };
                a.from[i] = v;
                return a;
            })
        }
        return [act];
    }), ++i);
}
function nor(type, actions, i = 0) {
    if (i === type.length)
        return actions;

    return nor(type, actions.flatMap(act => {
        if (Array.isArray(act.from[i]) && act.from[i][0] === 'nor') {
            const ignore = act.from[i].slice(1)
            return type[i][2].filter(v => !ignore.includes(v)).map(v => {
                const a = {
                    ...act, 
                    from: [...act.from], 
                    to: [...act.to]
                };
                a.from[i] = v;
                return a;
            })
        }
        return [act];
    }), ++i);
}
function validate(type, actions) {
    const scopes = type.map(([scope]) => scope);
    const values = type.map(([,,values])=>values);
    const len = scopes.length;

    for (const act of actions) {
        if (act.from.length !== len || act.to.length !== len)
            throw `Illegal state ${JSON.stringify(act)}`

        const modified = {};
        for (let i = 0; i < len; i++) {
            if (act.to[i] === act.from[i] || act.to[i] === '_' || act.to[i] === '-') {
                act.to[i] = act.from[i];
            }
            else {
                modified[scopes[i]] = true;
            }
            
            if (!values[i].includes(act.to[i]))
                throw `'${act.to[i]}' is invaid.`

            if (!values[i].includes(act.from[i]))
                throw `'${act.from[i]}' is invaid.`
        }
    }
}

function tree(type, actions, classPrefix) {
    const xs = [];
    const ys = [];
    let cw = 1;
    let ch = 1;

    for (let index = 0; index < type.length; index++) {
        const [, label, values, pos] = type[index];
        const cwl = cw * values.length;
        const chl = ch * values.length;
        if (pos === 'x') {
            xs.unshift({label, values, span: cw, index});
            cw = cwl;
        }
        else if(pos === 'y') {
            ys.unshift({label, values, span: ch, index});
            ch = chl;
        }
        else if (cwl < chl) {
            xs.unshift({label, values, span: cw, index});
            cw = cwl;
        }
        else {
            ys.unshift({label, values, span: ch, index});
            ch = chl;
        }
    }

    const xsv = xs.map(({values, span: length}, i) => 
        Array.from({
            length: xs.slice(0, i).reduce((acc, {values}) => acc * values.length, 1)
        }).flatMap(() => 
            values.flatMap(v => 
                Array.from({length}).map(_ => v))));
    
    const ysv = ys.map(({values, span: length}, i) => 
        Array.from({
            length: ys.slice(0, i).reduce((acc, {values}) => acc * values.length, 1)
        }).flatMap(() => 
            values.flatMap(v => 
                Array.from({length}).map(_ => v))));   
    
    const rows = [];
    for (let i = 0; i < ys.length; i++) {
        for (let j = 0; j < ysv[i].length; j++) {
            if (!rows[j]) {
                rows[j] = xsv[0]?.map(() => []) ?? [[]];
            }
            for (const cell of rows[j]) {
                cell[ys[i].index] = ysv[i][j];
            }
        }
    }
    for (let i = 0; i < xs.length; i++) {
        for (let j = 0; j < xsv[i].length; j++) {
            for (const row of rows) {
                row[j][xs[i].index] = xsv[i][j];
            }
        }
    }
    const t1 = [];

    xs.reduce((repeat,{ values, span }) => {
        const children = []
        for (let i = 0; i < repeat; i++) {
            for (const v of values) {
                children.push(['th', { colspan: span }, v]);
            }
        }
        t1.push(['tr', null, children])
        return values.length;
    }, 1)
    t1.push(['tr', null, [
        ['td', { 
            colspan: Math.max(xsv[0].length, 1),
        }, '']
    ]])
    rows.forEach(row => {
        const children = row.map(cell => ['td', {'data-state':`(${cell.join()})`},
            [
                ...new Set(
                    actions
                        .filter(act => act.from.join() === cell.join())
                        .map(({label}) => label)
                )
            ].map((label) => ['button', {
                'class': classPrefix + 'action',
            }, label])
        ]);
        t1.push(['tr', null, children])
    })

    let doms = [
        ['tr', null, [
            ['th', { 
                colspan: Math.max(ys.length, 1), 
            }, xs[0]?.label + '▶'],
            ['td', {
                rowspan: t1.length,
            }, [
                ['table', null, t1]
            ]]
        ]],
        ...xs.slice(1).map(({label}) => ['tr', null, [
            ['th', { colspan: Math.max(ys.length, 1) }, label + '▶']
        ]]),
        ['tr', null, ys.map(({label}) => ['th', null, '▼' + label])]
    ]
    ys.reduceRight((unders, { values, span }) => {
        return values.flatMap(v => unders.map((children, i) => {
            if (i == 0) {
                return [['th', { rowspan: span }, v], ...children];
            }
            return [...children];
        }))
    }, [[]]).forEach(children => {
        doms.push(['tr', null, children]);
    })

    doms = [['table', { 'id': classPrefix + 'table' }, doms]]

    for (const act of actions) {
        doms.push(['div', {
            'class': classPrefix + 'arrow',
            'data-from': `(${act.from.join(',')})`,
            'data-to': `(${act.to.join(',')})`,
            'data-label': act.label,
        }, [
            ['span', {}, act.comment]]
        ])
    }

    return doms;
}

function parse(md, classPrefix) {
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
                        return [!label && scope, label ?? scope, values, axis]
                    }))
                    console.log(type)
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
                            last.to = m[2].split(',').map(s => s.trim()).map(s => s === '\\_' ? '_' : s)
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

    const _actions = wildcard(type, nor(type, or(type, actions)))
    validate(type, _actions)
    return [tree(type, _actions, classPrefix), html]
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

function setup(classPrefix){
    for (const div of document.querySelectorAll(`.${classPrefix}arrow`))
    {
        const f = document.querySelector(`[data-state="${div.dataset.from}"]`);
        const t = document.querySelector(`[data-state="${div.dataset.to}"]`);
        const fr = f.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const fx = fr.left + fr.width / 2;
        const fy = fr.top + fr.height / 2;
        const tx = tr.left + tr.width / 2;
        const ty = tr.top + tr.height / 2;
        const dx = tx - fx;
        const dy = ty - fy;
        const d = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
        const th = Math.atan2(dy, dx);
        div.style.width = d + 'px';
        div.style.transform = `rotate(${th}rad)`;
        div.style.left = fx + 'px';
        div.style.top = fy + 'px';
    }

    for (const el of document.querySelectorAll('[data-state] > button'))
    {
        el.addEventListener('click', function() {
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
        })
    }
}

export function make(parent, md, classPrefix) {
    const [doms, html] = parse(md, classPrefix)
    render(parent, doms);
    setup(classPrefix)
    
    const doc = classPrefix + 'doc';
    document.getElementById(doc)?.remove()
    parent.insertAdjacentHTML('afterend', `<section id="${doc}">${html}</section>`);
}