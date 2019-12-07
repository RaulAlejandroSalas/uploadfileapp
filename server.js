const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const PORT = process.env.PORT || 3000;
const mongodbConnectionString = 'mongodb+srv://admin:server@cluster0-0r1vk.mongodb.net/uploadFiles?retryWrites=true&w=majority';
const app = express();

// Middleware
// app.use(function (req, res, next) {
//     res.header("Access-Control-Allow-Origin", "*");
//     res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//     next();
// });
app.use(cors({
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
    "preflightContinue": false,
    "optionsSuccessStatus": 204,
    "exposedHeaders": "Content-Range,X-Content-Range"
}))
app.use(bodyParser.json());
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');

//Getting connection instance
const connection = mongoose.createConnection(mongodbConnectionString, { useNewUrlParser: true, useUnifiedTopology: true });
let gridfs;

connection.on('open', () => {
    console.log("[DEBUG]", "Server has been connected to mongodbcloud");
    gridfs = new mongoose.mongo.GridFSBucket(connection.db, {
        bucketName: "uploads"
    });
});

//create instance Storage Engine
const storage = new GridFsStorage({
    url: mongodbConnectionString,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                if (err) {
                    return reject(err);
                }
                const filename = buf.toString("hex") + path.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: "uploads"
                };
                resolve(fileInfo);
            });
        });
    }
});
const upload = multer({ storage });

app.get('/', (req, res, next) => {
    gridfs.find().toArray((error, files) => {
        if (!files || files.length === 0) {
            res.render('index', { files: false });
        } else {
            files.map(file => {
                if (
                    file.contentType === 'image/jpeg' ||
                    file.contentType === 'image/png'
                ) {
                    file.isImage = true;
                } else {
                    file.isImage = false;
                }
            });
            res.render('index', { files: files });
        }
    });
})

app.post('/upload', upload.single('file'), (req, res) => {
    res.redirect('/');
});


// @route GET /image/:filename
// @desc Display Image
app.get('/image/:filename', (req, res) => {
    const file = gridfs
        .find({
            filename: req.params.filename
        })
        .toArray((err, files) => {
            if (!files || files.length === 0) {
                return res.status(404).json({
                    err: "no files exist"
                });
            }
            gridfs.openDownloadStreamByName(req.params.filename).pipe(res);
        });
});


// @route GET /files/:filename
// @desc  Display single file object
app.get('/files/:filename', (req, res) => {
    gridfs.find({
        filename: req.params.filename
    }).toArray((error, files) => {
        if (error) {
            res.status(500).send(error);
        }
        if (files.length > 0) {
            var mime = files[0].contentType;
            var filename = files[0].filename;
            const range = req.headers.range;
            if (range && typeof range === "string") {
                const parts = range.replace(/bytes=/, "").split("-");
                const partialstart = parts[0];
                const partialend = parts[1];
                const start = parseInt(partialstart, 10);
                const end = partialend ? parseInt(partialend, 10) : files[0].length - 1;
                const chunksize = (end - start) + 1;
                res.writeHead(206, {
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Disposition':"inline; filename=" + filename,
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + files[0].length,
                    'Content-Type': mime
                });
                gridfs.openDownloadStreamByName(req.params.filename, {start, end: end - 1}).pipe(res);
            } else {
                res.header('Content-Length', files[0].length);
                res.header('Content-Type', mime);
                gridfs.openDownloadStreamByName(req.params.filename).pipe(res);
            }

        } else {
            res.json('File Not Found');
        }
    })

});

// @route DELETE /files/:id
// @desc  Delete file
app.delete('/files/:id', (req, res) => {
    gridfs.delete(new mongoose.Types.ObjectId(req.params.id), (err, data) => {
        if (err) return res.status(404).json({ err: err.message });
        res.redirect("/");
    });
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));