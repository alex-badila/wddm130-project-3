const express = require('express')

const path = require('path')

const {check, validationResult} = require('express-validator');

const mongoose = require('mongoose');

var session = require('express-session');



/*const Order = mongoose.model('Order',{

 name:String,

 email:String,

 phone:String,

 postcode:String,

 lunch:String,

 ticket:Number,

 campus:String,

 sub:Number,

 tax:Number,

 total:Number

});*/

const Page = mongoose.model("Page", {
    name: String,
    content: String
});



const Admin = mongoose.model('Admin',{

 uname: String,

 pass: String

})





const app = express()





app.use(session({
    secret: 'mysecret',
    resave: false,
    saveUninitialized: false, // change this to false
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false // set to false, Vercel handles HTTPS at the edge
    }
}));




// Connection caching for serverless
// let isConnected = false;
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

app.get("/", async (req, res) => {
    await connectDB();
    try {
        const data = await Page.find({});

        if (req.session.loggedIn) {
            return res.redirect("/viewpages");
        }

        if (data.length === 0) {
            return res.redirect("/getpage/-1");
        }

        res.redirect("/getpage/" + data[0]._id);
    } catch (err) {
        console.error("Page Retrieval Error:", err);
        res.status(500).send("Error loading home");
    }
});

// Helper to get nav info fresh from DB every time
async function getNavInfo() {
    const pages = await Page.find({}, '_id name'); // only fetch what you need
    return pages.map(p => ({ id: p._id, name: p.name }));
}

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

app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {
    await connectDB();
    Admin.findOne({uname: req.body.uname}).then(data => {
        if(data !== null && data.pass === req.body.pass) {
            // user is logged in
            req.session.loggedIn = true;
            req.session.logName = data.uname;
            res.redirect("/");
        }
        else {
            res.render("login");
        }
    }).catch(err => {
        console.log("Login error");
    })
});

app.get("/logout", (req, res) => {
    req.session.loggedIn = false;
    req.session.logName = "";
    res.redirect("/");
});

app.get("/addpage", (req, res) => {
    if(req.session.loggedIn) {
        res.render("addpage", {loggedIn: req.session.loggedIn, logName: req.session.logName});
    }
});

app.post("/addpage", async (req, res) => {
    if (!req.session.loggedIn) return res.redirect("/login");

    if (!req.body.name || !req.body.content) {
        return res.redirect("/addpage");
    }

    try {
        await connectDB();
        const newPage = new Page({
            name: req.body.name,
            content: req.body.content
        });
        await newPage.save();
        res.redirect("/viewpages");
    } catch (err) {
        console.error("Page Save Error:", err);
        res.status(500).send("Failed to save page. Please try again.");
    }
});

app.get("/viewpages", async (req, res) => {
    if(req.session.loggedIn) {
        await connectDB();
        Page.find({}).then(data => {
            res.render("viewpages", { data: data, loggedIn: req.session.loggedIn, logName: req.session.logName });
        }).catch(err => console.log(err));
    } else {
        res.redirect("/login"); // ← handle the not logged in case
    }
});

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

app.get("/update/:ids", async (req, res) => {
    if (!req.session.loggedIn) return res.redirect("/login");

    await connectDB();
    let id = req.params.ids;
    Page.findOne({ _id: id }).then(data => {
        if (!data) return res.redirect("/viewpages");
        res.render("update", { page: data, id: data._id });
    }).catch(err => console.log(err));
});

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