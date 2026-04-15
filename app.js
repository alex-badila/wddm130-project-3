const express = require('express')
const path = require('path')
const {check, validationResult} = require('express-validator');
const mongoose = require('mongoose');
const fileUpload = require("express-fileupload");
let session = require('express-session');

const Page = mongoose.model("Page", {
    name: String,
    content: String,
    image: String
});

const Admin = mongoose.model('Admin',{
    uname: String,
    pass: String
})

const app = express()

app.use(fileUpload());

app.use(session({
    secret: 'mysecret',
    resave: false,
    saveUninitialized: false, 
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false 
    }
}));


// Connection caching for serverless
async function connectDB() {
    // Already connected
    if (mongoose.connection.readyState === 1) return;
    
    // Connection is in progress, wait for it
    if (mongoose.connection.readyState === 2) {
        await new Promise((resolve, reject) => {
            mongoose.connection.once('connected', resolve);
            mongoose.connection.once('error', reject);
        });
        return;
    }

    // Add a timeout so it fails fast instead of hanging forever
    await Promise.race([
        mongoose.connect("mongodb+srv://alexbadila:Yo3kpaxy@cluster0.bwb3wky.mongodb.net/project3-help"),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error("DB connection timeout")), 10000)
        )
    ]);
}


app.use(express.urlencoded({extended:false}));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.use('/tinymce', express.static(path.join(__dirname, 'node_modules', 'tinymce')));
app.set('view engine', 'ejs');

// Read cookie manually
function getLoggedInUser(req) {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/logName=([^;]+)/);
    return match ? match[1] : null;
}

// Render the home page
app.get("/", async (req, res) => {
    const logName = getLoggedInUser(req);
    await connectDB();
    try {
        const data = await Page.find({});
        if (logName) return res.redirect("/viewpages");
        if (data.length === 0) return res.redirect("/getpage/-1");
        res.redirect("/getpage/" + data[0]._id);
    } catch (err) {
        res.status(500).send("Error loading home");
    }
});

// Helper to get nav info fresh from DB every time
async function getNavInfo() {
    const pages = await Page.find({}, '_id name'); // only fetch what you need
    return pages.map(p => ({ id: p._id, name: p.name }));
}

// Renders a specific page
app.get("/getpage/:idx", async (req, res) => {
    let id = req.params.idx;
    await connectDB();

    try {
        const navInfo = await getNavInfo();

        if (id === "-1") {
            res.render("home", { navdata: navInfo, webdata: null });
        } else {
            const data = await Page.findOne({ _id: id });
            res.render("home", { navdata: navInfo, webdata: data });
        }
    } catch (err) {
        console.error("Page Load Error:", err);
        res.status(500).send("Error loading page");
    }
}); 

// Renders the login page
app.get("/login", (req, res) => {
    res.render("login");
});

// Takes the login information, validates it, then redirects to the home page if successful
app.post("/login", async (req, res) => {
    await connectDB();
    try {
        const data = await Admin.findOne({ uname: req.body.uname });
        if (data !== null && data.pass === req.body.pass) {
            res.setHeader('Set-Cookie', `logName=${data.uname}; HttpOnly; SameSite=Lax; Path=/`);
            res.redirect("/");
        } else {
            res.render("login");
        }
    } catch (err) {
        res.status(500).send("Login error");
    }
});

// Logs out the user
app.get("/logout", (req, res) => {
    res.setHeader('Set-Cookie', 'logName=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.redirect("/");
});

// Renders the add page form
app.get("/addpage", (req, res) => {
    const logName = getLoggedInUser(req);
    if (logName) {
        res.render("addpage", { loggedIn: true, logName: logName });
    } else {
        res.redirect("/login");
    }
});

// Takes the add page form information, validates it, then adds it to the DB if successful
app.post("/addpage", [
    check("name", "Name is empty").notEmpty(),
    check("content", "Content is empty").notEmpty()
],  async (req, res) => {
    const errors = validationResult(req);

    if (!req.files || !req.files.image) {
        return res.render("addpage", { errors: [{ msg: "Image is empty" }] });
    }

    if(errors.isEmpty()) {

        const logName = getLoggedInUser(req);
        if (!logName) return res.redirect("/login");

        let name = req.body.name;
        let content = req.body.content;

        let imageData = req.files.image.data.toString('base64');
        let mimeType = req.files.image.mimetype;
        let imageSrc = `data:${mimeType};base64,${imageData}`;

        try {
            await connectDB();
            const newPage = new Page({ name: name, content: content, image: imageSrc });
            await newPage.save();
            res.redirect("/viewpages");
        } catch (err) {
            console.error("Page Save Error:", err);
            res.status(500).send("Failed to save page.");
        }
    }
    else {
        res.render("addpage", {errors: errors.array()});
    }
});

// Renders the page listing all pages with options to edit or delete
app.get("/viewpages", async (req, res) => {
    const logName = getLoggedInUser(req);
    if (logName) {
        await connectDB();
        try {
            const data = await Page.find({});
            res.render("viewpages", { data: data, loggedIn: true, logName: logName });
        } catch (err) {
            res.status(500).send("Error loading pages");
        }
    } else {
        res.redirect("/login");
    }
});

// Deletes a specific page
app.get("/delete/:ids", async (req, res) => {
    // await connectDB();
    let id = req.params.ids;
    // console.log(id);
    await connectDB();
    Page.findOneAndDelete({_id: id}).then(data => {
        if(data !== null) {
            res.redirect("/viewpages");
        }
        else {
            console.log("Error deleting data");
        }
    })
    .catch(err => {
        console.log(err);
    });
});

// Renders the update page form for a specific page
app.get("/update/:ids", async (req, res) => {
    const logName = getLoggedInUser(req);
    if (!logName) return res.redirect("/login");

    await connectDB();
    let id = req.params.ids;
    Page.findOne({ _id: id }).then(data => {
        if (!data) return res.redirect("/viewpages");
        res.render("update", { page: data, id: data._id });
    }).catch(err => console.log(err));
});

// Takes the update page form information, validates it, then updates the DB if successful
app.post("/update/:ids", [
    check("name", "Name is empty").notEmpty(),
    check("content", "Content is empty").notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    
    let id = req.params.ids;


    if(errors.isEmpty()) {
        await connectDB();    
        Page.findOne({_id: id}).then(data => {
            if(!data) {
                return res.redirect("/viewpages");
            }

            data.name = req.body.name;
            data.content = req.body.content;

            if (req.files && req.files.image) {
                // New image uploaded, convert to base64
                let imageData = req.files.image.data.toString('base64');
                let mimeType = req.files.image.mimetype;
                let imageSrc = `data:${mimeType};base64,${imageData}`;
                data.image = imageSrc;
            }
            else if (!data.image) {
                // No new image uploaded AND no existing image in DB
                return res.render("update", { errors: [{ msg: "Image is empty" }], id: id, page: req.body });
            }
            // else: no new image but existing image in DB, just keep it

            data.save().then(() => {
                res.redirect("/viewpages");
            }).catch(err => {
                console.log(err);
            }); 

        });
    } 
    else {
        res.render("update", { page: req.body, errors: errors.array(), id: id });
    }
});

// Export for Vercel
module.exports = app;

// Only listen when running locally
if (process.env.NODE_ENV !== "production") {
    app.listen(3000, () => {
        console.log('Server running on http://localhost:3000');
    });
}