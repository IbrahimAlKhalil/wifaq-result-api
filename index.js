const cluster = require('cluster');

// Fork a new worker process for each CPU Core if this the master process
if (cluster.isMaster) {
    // This is the master process

    // Get CPU Core count
    const cpuCount = require('os').cpus().length;

    // Create a worker for each core
    for (let i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }
} else {
    // This is a worker process
    require('dotenv').config();
    const Koa = require('koa');
    const Router = require('koa-router');
    const {MongoClient} = require('mongodb');

    function env(name, defaultValue) {
        return process.env[name] === undefined ? defaultValue : process.env[name];
    }

    async function init(port) {

        // Connect to mongodb
        const mongo = await MongoClient.connect(`mongodb://${env('username')}:${env('password')}@${env('host')}:${env('port')}`, {useNewUrlParser: true});

        // Results db
        const db = mongo.db('results');

        // Students collection
        const students = db.collection('students');
        const madrasas = db.collection('madrasas');
        const markajes = db.collection('markajes');

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
                    total: 0
                }
            });

            // Serve result if exists
            if (student) {

                // Load madrasa
                const madrasa = await madrasas.findOne({
                    _id: student.elhaq
                }, {
                    projection: {
                        _id: 0
                    }
                });

                // Load markaj
                const markaj = await markajes.findOne({
                    _id: student.markaj
                }, {
                    projection: {
                        _id: 0
                    }
                });

                student.madrasa = madrasa.name;
                student.markaj = markaj.name;

                ctx.body = student;
            } else {
                ctx.body = {
                    status: 404,
                    message: 'Nothing found!'
                };
                ctx.status = 404;
            }

            next();
        });


        /*** Madrasa-wise Results ***/

        function parseElhaq(elhaq) {
            return elhaq.replace(/@/gm, '/');
        }

        router.get('/madrasas/:year/:elhaq/:classId', async (ctx, next) => {
            const params = ctx.params;
            const result = await students.find({
                year: params.year,
                classId: Number(params.classId),
                elhaq: parseElhaq(params.elhaq)
            })
                .project({
                    _id: 0,
                    elhaq: 0,
                    markaj: 0,
                    classId: 0,
                    year: 0
                })
                .toArray();

            const madrasa = await madrasas.findOne({
                _id: parseElhaq(params.elhaq)
            });

            if (result.length) {
                ctx.body = {madrasa, students: result};
            } else {
                ctx.body = fourZeroFour;

                ctx.status = 404;
            }

            next();
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
                    elhaq: 1,
                    total: 1,
                    position: 1
                })
                .toArray();

            const elhaqs = await madrasas.find({
                _id: {$in: result.map(student => student.elhaq)}
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

            next();
        });


        /*** Madrasa Statistic ***/

        router.get('/madrasas/stat/:elhaq', async (ctx, next) => {
            const elhaq = parseElhaq(ctx.params.elhaq);
            const result = await students.find({elhaq})
                .project({
                    _id: 0,
                    name: 1,
                    roll: 1,
                    father: 1,
                    division: 1,
                    position: 1,
                    classId: 1,
                    year: 1,
                    results: 1
                })
                .toArray();

            const madrasa = await madrasas.findOne({_id: elhaq});

            if (result.length) {
                ctx.body = {madrasa, students: result};
            } else {
                ctx.body = fourZeroFour;
                ctx.status = 404;
            }

            next();
        });


        /*******************************************************************/
        app.use(router.routes());
        app.listen(port);
    }

    init(5000).then(() => {
        console.log('The app is running on http://localhost:5000');
    });
}


