require( '../stringExtensions' );

const lastUpdateService = require( './lastUpdate' );
const elasticsearch = require( '../config/elasticsearch' );
const colorsConfig = require( '../config/colors' );

module.exports = () => {
    const expensesService = new Object();

    /**
     *
     *
     * @param {any} from
     * @param {any} to
     * @param {any} groupBy
     * @param {any} filter
     * @returns
     */
    function parseBody( from, to, groupBy, filter ) {

        const body =
            {
                'size': 0,
                'sort': [
                    '_score'
                ],
                'query': {
                    'bool': {
                        'must': [
                            {
                                'range': {
                                    'data': {
                                        'gte': from,
                                        'lte': to
                                    }
                                }
                            }
                        ]
                    }
                },
                'aggs': {
                    'group_by': {
                        'terms': {
                            'field': groupBy,
                            'size': 0
                        },
                        'aggs': {
                            'Empenhado': {
                                'sum': {
                                    'field': 'valorEmpenho'
                                }
                            },
                            'Liquidado': {
                                'sum': {
                                    'field': 'valorLiquidado'
                                }
                            },
                            'Pago': {
                                'sum': {
                                    'field': 'valorPago'
                                }
                            },
                            'Rap': {
                                'sum': {
                                    'field': 'valorRap'
                                }
                            },
                            'First': {
                                'top_hits': {
                                    'size': 1
                                }
                            }
                        }
                    },
                    'EmpenhadoTotal': {
                        'sum': {
                            'field': 'valorEmpenho'
                        }
                    },
                    'LiquidadoTotal': {
                        'sum': {
                            'field': 'valorLiquidado'
                        }
                    },
                    'PagoTotal': {
                        'sum': {
                            'field': 'valorPago'
                        }
                    },
                    'RapTotal': {
                        'sum': {
                            'field': 'valorRap'
                        }
                    }
                }
            };

        if ( filter ) {
            body.query.bool.must.push( filter );
        }

        return body;
    }

    function parseItems( buckets, labelField, keyField, total ) {
        let items = buckets.map( a => {
            const value = a.Pago.value + a.Rap.value;
            const percentage = value / total * 100;

            return {
                originId: `${keyField}_${a.First.hits.hits[ 0 ]._source[ keyField ]}`,
                label: a.First.hits.hits[ 0 ]._source[ labelField ].titleCase(),
                value: +value.toFixed( 2 ),
                percentage: Math.round( percentage ),
                decimalPercentage: percentage
            };
        } );

        items = items.sort( ( a, b ) => b.value - a.value );

        items = items.map( ( a, i ) => {
            a.plot = i < 10;
            a.color = a.plot ? colorsConfig.colors[ i ] : colorsConfig.othersColor;
            a.list = true;

            return a;
        } );

        const others = items.filter( a => !a.plot );
        if ( others.length > 0 ) {
            const othersValue = others.reduce( ( total, curr ) => total + curr.value, 0 );
            const percentage = othersValue / total * 100;

            items.push( {
                label: 'Outros',
                value: othersValue,
                percentage: Math.round( percentage ),
                decimalPercentage: percentage,
                color: colorsConfig.othersColor,
                list: false,
                plot: true
            } );
        }

        return items;
    }

    function parseResult( result, labelField, keyField, info ) {
        const total = result.aggregations.PagoTotal.value + result.aggregations.RapTotal.value;

        return {
            total: +total.toFixed( 2 ),
            items: parseItems( result.aggregations.group_by.buckets, labelField, keyField, total ),
            info: info || 'Os valores recebidos correspondem ao que o fornecedor recebeu pela prestação do serviço ou entrega do produto, somando o valor pago neste exercício e o pago em restos a pagar.'
        };
    }

    function byExpenseGroup( from, to, field, originId ) {

        const filter = {
            'term': new Object()
        };

        filter.term[ field ] = {
            'value': originId
        };

        return elasticsearch.client.search( {
            index: 'despesas',
            body: parseBody( from, to, 'codigoGrupoDespesa', filter )
        } )
        .then( result => parseResult( result, 'grupoDespesa', 'codigoGrupoDespesa' ) );
    }

    expensesService.byArea = ( from, to ) => {

        const info = 'Nesta consulta é exibido o total gasto pelo Governo do Estado em cada área de atuação, por exemplo, Saúde, Educação, Segurança Pública, etc. O valor apresentado representa o valor pago no exercício mais o valor pago em restos a pagar.';

        return elasticsearch.client.search( {
            index: 'despesas',
            body: parseBody( from, to, 'codigoFuncao' )
        } )
        .then( result => parseResult( result, 'funcao', 'codigoFuncao', info ) );
    };

    expensesService.byOrigin = ( from, to ) => {

        const info = 'Nesta consulta é exibido o total gasto por cada Órgão do Governo do Estado. O valor apresentado representa o valor pago no exercício mais o valor pago em restos a pagar.';

        return elasticsearch.client.search( {
            index: 'despesas',
            body: parseBody( from, to, 'codigoUnidadeGestora' )
        } )
        .then( result => parseResult( result, 'unidadeGestora', 'codigoUnidadeGestora', info ) );
    };

    expensesService.byExpenseGroup = ( from, to, originId ) => {
        const keyField = originId.split( '_' )[ 0 ];
        const id = originId.split( '_' )[ 1 ];

        return byExpenseGroup( from, to, keyField, id );
    };

    expensesService.lastUpdate = () => {
        return lastUpdateService().byArea( 'Despesa' );
    };

    return expensesService;
};
