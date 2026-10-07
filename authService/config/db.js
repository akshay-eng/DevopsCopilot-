const {mongoose} = require('mongoose')
require('dotenv').config()

mongoose.connect(process.env.MONGO_DB_URI,{useUnifiedTopology:true,useNewUrlParser:true}).then(()=>{

    console.log("DB CONNECTED")
}).catch((err)=>{
    console.log(err)
})