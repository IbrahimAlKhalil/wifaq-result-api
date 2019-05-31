require('dotenv').config();
const Koa = require('koa');
const Router = require('koa-router');
const {MongoClient} = require('mongodb');

function env(name, defaultValue) {
    return process.env[name] === undefined ? defaultValue : process.env[name];
}

async function init() {
    // Connect to mongodb
    const mongo = await MongoClient.connect(`mongodb://${env('mongo-username')}:${env('mongo-password')}@${env('mongo-host')}:${env('mongo-port')}`, {useNewUrlParser: true});

    // Results db
    const db = mongo.db('results');

    // Students collection
    const students = db.collection('students');
    const madrasas = db.collection('madrasas');
    const subjects = db.collection('subjects');

    const app = new Koa();
    const router = new Router();
    const fourZeroFour = {
        status: 404,
        message: 'Nothing found!'
    };

    /******************************************************/

    /*** Individual result ***/

    router.get('/students/:year/:classId/:roll', async (ctx, next) => {
        const params = ctx.params;

        const student = await students.findOne({
            roll: Number(params.roll),
            year: params.year,
            classId: Number(params.classId)
        }, {
            projection: {
                _id: 0,
                classId: 0,
                year: 0,
                roll: 0,
            }
        });

        // Serve result if exists
        if (student) {
            // load madrasa and markaj

            const options = {
                projection: {
                    _id: 0
                }
            };
            const pack = await Promise.all([
                madrasas.findOne({
                    _id: student.madrasa
                }, options),

                /*madrasas.findOne({
                    _id: student.markaj
                }, options),*/

                subjects.findOne({
                    year: params.year,
                    gender: student.gender,
                    classId: Number(params.classId)
                }, {
                    projection: {
                        year: 0,
                        classId: 0,
                        gender: 0,
                        _id: 0
                    }
                })
            ]);

            student.madrasa = pack[0].name;
            // student.markaj = pack[1].name;
            // student.subjects = pack[2].subjects;

            /*** Remove this line ***/
            student.subjects = pack[1].subjects;
            console.log(pack[1]);
            delete student.elhaq;

            ctx.body = student;
        } else {
            ctx.body = {
                status: 404,
                message: 'Nothing found!'
            };
            ctx.status = 404;
        }

        await next();
    });


    /*** Madrasa-wise Results ***/

    function parseElhaq(elhaq) {
        return elhaq.replace(/@/gm, '/');
    }

    router.get('/madrasas/:elhaq/:year/:classId', async (ctx, next) => {
        const params = ctx.params;

        const madrasa = await madrasas.findOne({
            elhaq: parseElhaq(params.elhaq)
        });

        if (!madrasa) {
            ctx.body = fourZeroFour;

            ctx.status = 404;

            return await Promise.resolve(next());
        }

        const result = await students.find({
            year: params.year,
            classId: Number(params.classId),
            madrasa: madrasa._id
        })
            .project({
                _id: 0,
                classId: 0,
                year: 0,
                graceLabel: 0,
                dob: 0,
                father: 0,
                regId: 0,
                posSub: 0,
                markaj: 0
            })
            .toArray();

        if (result.length) {
            const options = {
                projection: {
                    _id: 0
                }
            };
            const pack = await Promise.all([
                subjects.findOne({
                    year: params.year,
                    gender: result[0].gender,
                    classId: Number(params.classId)
                }, {
                    projection: {
                        year: 0,
                        classId: 0,
                        _id: 0
                    }
                }),

                (() => {
                    return new Promise(resolve => {
                        result.forEach(student => {
                            delete student.markaj;
                            delete student.madrasa;
                        });
                        resolve();
                    });
                })()
            ]);

            ctx.body = {
                madrasa: madrasa.name,
                subjects: pack[0].subjects,
                students: result
            };
        } else {
            ctx.body = fourZeroFour;

            ctx.status = 404;
        }

        await next();
    });

    /*** Medha Talika ***/

    router.get('/medha-talika/:year/:classId/:gender', async (ctx, next) => {
        const params = ctx.params;
        const result = await students.find({
            year: params.year,
            classId: Number(params.classId),
            gender: Number(params.gender),
            position: {$gt: 0}
        })
            .project({
                _id: 0,
                name: 1,
                roll: 1,
                madrasa: 1,
                position: 1,
                total: 1
            })
            .toArray();

        const elhaqs = await madrasas.find({
            _id: {$in: result.map(student => student.madrasa)}
        }).project({
            elhaq: 0
        }).toArray();

        if (result.length) {
            ctx.body = {
                madrasas: elhaqs,
                students: result,
            };
        } else {
            ctx.body = fourZeroFour;
            ctx.status = 404;
        }

        await next();
    });

    /*******************************************************************/
    app.use(async (ctx, next) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        ctx.set('Access-Control-Allow-Methods', 'GET');
        await next();
    });
    app.use(router.routes());
    app.listen(env('app-port', 5000));

    process.on('exit', async () => {
        await mongo.close();
    });
}

init().then(() => {
    console.log('The app is running on http://localhost:5000');
}).catch(e => {
    console.error(e);
    process.exit(0);
});

