import express from 'express';
import multer from 'multer';
import {UploadApiResponse, v2 as cloudinary} from 'cloudinary';
import File from '../models/File'
import https from 'https'
import createEmailTemplate from '../utils/createEmailTemplate';
const nodemailer = require("nodemailer");

const router = express.Router()
const storage = multer.diskStorage({})

let upload = multer({
    storage
})
router.post("/upload",upload.single("myFile"),async(req,res)=>{
    try {
        if(!req.file)
        return res.status(400).json({message: "Hey bro! we need the file"});
        console.log(req.file)
        let uploadedFile!: UploadApiResponse;
        try {
            uploadedFile = await cloudinary.uploader.upload(req.file.path,{
                folder: "sharefile",
                resource_type: "auto"
            })
        } catch (error) {
            console.log(error)
            res.status(400).json({message: "Cloudinary error"});
        }

        const {originalname} = req.file;
        const {secure_url, bytes, format} = uploadedFile;
        const file = new File({
        filename: originalname,
        sizeInBytes: bytes,
        secure_url,
        format,});
        await file.save()
        res.status(200).json({
            id: file._id,
            downloadPageLink: `${process.env.API_BASE_ENDPOINT_CLIENT}download/${file._id}`,
        });
    } catch (error) {
        console.log(error)
        res.status(500).json({message: "Server error :("});
    }
})

router.get("/:id",async(req,res)=>{
    try {
        const id = req.params.id
        const file = await File.findById(id)
        if(!file) {
            return res.status(404).json({message:"File does not exist"})
        }
        const {filename, format, sizeInBytes} = file;
        return res.status(200).json({
            name:filename,
            sizeInBytes,
            format,
            id, 
        })
    } catch (error) {
        return res.status(500).json({message:"Server Error :("})
    }
})

router.get("/:id/download",async(req,res)=>{
    try {
        const id = req.params.id
        const file = await File.findById(id)
        if(!file) {
            return res.status(404).json({message:"File does not exist"})
        }
        https.get(file.secure_url,(fileStream)=>fileStream.pipe(res))
    } catch (error) {
        return res.status(500).json({message:"Server Error :("})
    }
})

router.post("/email",async(req,res)=>{
    const {id,emailFrom,emailTo} = req.body
    if(!id||!emailFrom||!emailTo){
        return res.status(400).json({message:"Invalid data"});
    }
    const file = await File.findById(id)
    if(!file) {
        return res.status(404).json({message:"File does not exist"})
    }

    if(file.sender) {
        return res.status(400).json({message:"File is already sent"})   
    }

    let transporter = nodemailer.createTransport({
    //@ts-ignore
    host: process.env.SENDINBLUE_SMTP_HOST!,
    port: process.env.SENDINBLUE_SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SENDINBLUE_SMTP_USER, // generated ethereal user
        pass: process.env.SENDINBLUE_SMTP_PASSWORD, // generated ethereal password
    },
    });

    const {filename,sizeInBytes} = file;
    const fileSize = `${(Number(sizeInBytes) / (1024 * 1024)).toFixed(2)} MB `;
    const downloadPageLink = `${process.env.API_BASE_ENDPOINT_CLIENT}download/${id}`;

    const mailOption = {
        from: emailFrom, // sender address
        to: emailTo, // list of receivers
        subject: "File shared with you", // Subject line
        text: `${emailFrom} shared a filw with you`, // plain text body
        html: createEmailTemplate(emailFrom,downloadPageLink,filename,fileSize), // html body
    }

    transporter.sendMail(mailOption,async(error:any)=>{
        if(error){
            console.log(error)
            return res.status(500).json({message:"Server Error :("})
        }
        file.sender = emailFrom
        file.receiver = emailTo

        await file.save()
        return res.status(200).json({message:"Email Sent"})
    })

})

export default router;