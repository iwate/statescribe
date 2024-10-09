const methods = {
    define,
    list,
    state,
    action,
    ":": state,
    "$": action,
}

function call(args) {
    args = Array.from(args)
    return methods[args.shift()]?.(args)
}
function list(args) {
    return args.map(x => Array.isArray(x) ? call(x) : x)
}
function state(args) {
    args = Array.from(args)
    const label = args.shift();
    const scope = label.split('/')[0];
    return [scope, label, args]
}
function action (args) {
    args = Array.from(args);
    const label = args.shift();
    const from = call(args.shift());
    const to = call(args.shift());
    const comment = args.join(' ');
        
    return { label, from, to, comment };
}
function define(args) {
    args = Array.from(args);
    const type = call(args.shift());
    const actions = wildcard(type, list(args));

    validate(type, actions);

    return render(type, actions);
}
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
function validate(type, actions) {
    const scopes = type.map(([scope]) => scope);
    const values = type.map(([,,values])=>values);
    const len = scopes.length;

    for (const act of actions) {
        if (act.from.length !== len || act.to.length !== len)
            throw `Illegal state ${JSON.stringify(a)}`

        const modified = {};
        for (let i = 0; i < len; i++) {
            if (act.to[i] === act.from[i] || act.to[i] === '_') {
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

        //if (Object.keys(modified).length > 1)
          //  throw `You cannot change the statuses of multiple system scopes at once: '${act.label}'`
    }
}
function render(type, actions) {
    const xs = [];
    const ys = [];
    let cw = 1;
    let ch = 1;

    for (let index = 0; index < type.length; index++) {
        const [, label, values] = type[index];
        const cwl = cw * values.length;
        const chl = ch * values.length;
        if (cwl < chl) {
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
    //const cells = rows.map(row => ['tr', null, row.map(cell => ['td', null, `(${cell.join()})`])])
    const t1 = [];

    xs.reduce((repeat,{ values, span }) => {
        const children = []
        //children.push(['th', { colspan: ys.length }, label])
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
            [...new Set(actions.filter(act => act.from.join() === cell.join()).map(({label}) => label))].join()
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

    doms = [['table', null, doms]]

    for (const act of actions) {
        doms.push(['div', {
            'class': 'action',
            'data-from': `(${act.from.join(',')})`,
            'data-to': `(${act.to.join(',')})`,
            'data-label': act.label,
        }, ''])
    }

    return doms;
}

export function parse(text = '') {
    text = text.replace(/(?<!\\)[=|]/g, ' ');
    text = text.replace(/\\([=|])/g, '$1')
    text = text.replaceAll('[', '(list ');
    text = text.replaceAll(']', ')');
    
    const input = Array.from(text);
    const terminals = ['(', ')', ' ', '\t', '\r', '\n'];
    const stack = [[]];
    let str = '';
    let c;
    while((c = input.shift())) {
        if (terminals.includes(c)) {
            if (str.length > 0) {
                stack.at(-1)?.push(str);
                str = '';
            }
        
            if (c == '(') {
                stack.push([])
            }
            else if (c == ')') {
                const last = stack.pop();
                stack.at(-1).push(last);
            }
        }
        else {
            str += c;
        }
    }

    return stack.pop();
}

export const run = list;
//list(input)