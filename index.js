/* ====================================
 * = Miitomo (kaeru:tomo) web patcher =
 * ==================================== */

const Queue = require('better-queue');
const Express = require('express');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const execa = require('execa');
const crypto = require('crypto');
const path = require('path');
const fse = require('fse');

const port = parseInt(process.env.PORT) || 8080;

const PatchQueue = new Queue(async (p, cb) => {
    // We've got something in the queue, process it!
    const { apkId } = p;
    const workingDir = `/tmp/miitomo/${apkId}`;
    console.log(`[Q] Starting to process ${apkId} (${workingDir})...`);

    try {
        // Extract apk
        await execa('apktool', ['d', '-s', 'in.apk', '-o', 'app'], { cwd: workingDir });
        // Delete input apk
        await execa('rm', ['in.apk'], { cwd: workingDir });
        // Patch classes.dex
        await execa('xdelta3', ['-d', '-f', '-s', 'classes.dex', `${path.join(__dirname, 'data', 'patch.xdelta')}`, 'classes.dex'], { cwd: `${workingDir}/app`, stdout: process.stdout });
        // Copy new npf.json
        await execa('cp', ['-f', `${path.join(__dirname, 'data', 'npf.json')}`, `${workingDir}/app/assets/npf.json`], { stdout: process.stdout });
        // Repack apk
        await execa('apktool', ['b', 'app', '-o', 'out.apk'], { cwd: workingDir, stdout: process.stdout });
        // Sign apk
        await execa('java', ['-jar', 'signer.jar', '-a', path.join(workingDir, 'out.apk')], { stdout: process.stdout });
        console.log(`[Q] Finished? ${apkId}`);
        cb(null, path.join(workingDir, 'out-aligned-debugSigned.apk'));
    } catch (e) {
        cb(`failed ${e}`);
    }
});

const app = Express();

app.use(Express.static('static/'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload({
    limits: { filesize: 40 * 1024 * 1024 }
}));

app.post('/patch', async (req, res) => {
    //console.log('p', req.files)
    if(!req.files || !req.files.app) return res.send('No file to patch!');
    if(!req.files.app.name.endsWith('.apk')) return res.send('Not an APK file!');
    const id = crypto.randomBytes(16).toString('hex');
    try {
        await fse.mkdir(`/tmp/miitomo/${id}/`);
        req.files.app.mv(`/tmp/miitomo/${id}/in.apk`);
        PatchQueue.push({ apkId: id }, (e, apk) => {
            if(e) res.send(`Error: ${e}`);
            console.log(`${id}: ${apk}`)
            res.download(apk, 'Miitomo_KaeruTomo_Patched.apk');
        });
    } catch (e) { 
        res.send(`Error: ${e}`);
    }
});

app.listen(port, async () => {
    console.log(`[INFO] Miitomo web patcher listening on port ${port}...`);
    console.log('[START] Making sure /tmp/miitomo exists...');
    try {
        await fse.mkdir('/tmp/miitomo');
        console.log('[START] Directory either exists or was created!');
    } catch (e) {
        console.error(e);
    }
});