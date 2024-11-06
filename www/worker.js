function wildcard(type, actions, prop, i = 0) {
    if (i === type.length)
        return actions;

    return wildcard(type, actions.flatMap(act => {
        if (act[prop][i] === '*') {
            return type[i][2].map(v => {
                const a = {
                    ...act, 
                    from: [...act.from], 
                    to: [...act.to]
                };
                a[prop][i] = v;
                return a;
            })
        }
        return [act];
    }), prop, ++i);
}

function or(type, actions, prop, i = 0) {
    if (i === type.length)
        return actions;

    return or(type, actions.flatMap(act => {
        if (Array.isArray(act[prop][i]) && act[prop][i][0] === 'or') {
            return act[prop][i].slice(1).map(v => {
                const a = {
                    ...act, 
                    from: [...act.from], 
                    to: [...act.to]
                };
                a[prop][i] = v;
                return a;
            })
        }
        return [act];
    }), prop, ++i);
}
function nor(type, actions, prop, i = 0) {
    if (i === type.length)
        return actions;

    return nor(type, actions.flatMap(act => {
        if (Array.isArray(act[prop][i]) && act[prop][i][0] === 'nor') {
            const ignore = act[prop][i].slice(1)
            return type[i][2].filter(v => !ignore.includes(v)).map(v => {
                const a = {
                    ...act, 
                    from: [...act.from], 
                    to: [...act.to]
                };
                a[prop][i] = v;
                return a;
            })
        }
        return [act];
    }), prop, ++i);
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
    actions = wildcard(type, nor(type, or(type, actions, 'from'), 'from'), 'from')
    actions = wildcard(type, nor(type, or(type, actions, 'to'), 'to'), 'to')
    validate(type, actions)
    for (let act of actions) {
        act.fromText = act.from.join(',')
        act.toText = act.to.join(',')
    }
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
        return values.length * repeat;
    }, 1)
    t1.push(['tr', null, [
        ['td', { 
            colspan: Math.max(xsv[0].length, 1),
        }, '']
    ]])
    rows.forEach(row => {
        const children = row.map(cell => {
            const cellText = cell.join()
            return ['td', {'data-state':`(${cellText})`},
                [
                    ...new Set(
                        actions
                            .filter(act => act.fromText === cellText)
                            .map(({label}) => label)
                    )
                ].map((label) => ['button', {
                    'class': classPrefix + 'action',
                }, label])
            ]
        });
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
            'data-from': `(${act.fromText})`,
            'data-to': `(${act.toText})`,
            'data-label': act.label,
        }, [
            ['span', {}, act.comment]]
        ])
    }

    console.log('doms')
    return doms;
}

onmessage = (e) => {
    console.log(e)
    postMessage([tree(...e.data)]);
};