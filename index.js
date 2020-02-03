var express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const jsonfile = require("jsonfile");
var nodemailer = require("nodemailer");
const json2html = require("node-json2html");
const ejs = require("ejs");
const schedule = require('node-schedule');
require("dotenv").config();

var app = express();

process.on('uncaughtException', function(err) {
  console.log('Uncaught exception! =>', err);
})

process.on('unhandledRejection', function(err) {
  console.log('Unhandled rejection! => ',err);
})

app.listen(process.env.PORT, () => {
  console.log('App is running on port: ', process.env.PORT);
  schedule.scheduleJob('* * * * *', function() {
    main();
  });
})

async function main() {
  const todayFilepath = "./today.json";
  const yesterdayFilepath = "./yesterday.json";
  const templateFilepath = "./template.hbs";
  let itemTargetCount = 0;

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setViewport({ width: 1280, height: 926 });

    // Open wishlist page
    await page.goto("https://www.myntra.com/wishlist", { waitUntil: "load" });
    await page.setDefaultNavigationTimeout(0);
    page.click(".wishlistLogin-button");
    await page.waitForNavigation();

    // Enter email & password
    await page.type(".login-user-input-email", process.env.MYNTRA_USER);
    await page.type(".login-user-input-password", process.env.MYNTRA_PWD);
    page.click(".login-login-button");
    await page.waitForNavigation();
    console.log("Login successfully");

    // Start scrapping
    const items = await scrapeInfiniteScrollItems(page, extractItems);
    jsonfile.writeFile(todayFilepath, items, { spaces: 2 });

    // Comporing data
    const todayFile = await jsonfile.readFile(todayFilepath);
    const yesterdayFile = await jsonfile.readFile(yesterdayFilepath);
    const priceDown = [];

    for (let i = 0; i < itemTargetCount; i++) {
      if (todayFile[i].price > yesterdayFile[i].price) {
        priceDown.push(todayFile[i]);
      }
    }

    let transform = getHtmlTemplate();

    let html = json2html.transform(priceDown, transform);
    fs.writeFile(templateFilepath, html, err => {
      if (err) throw new Error("Error while saving html template: ", err);
      console.log("Template saved successfully");
      if (priceDown.length > 0) {
        sendEmail();
      }
    });

    browser.close();
    console.log("Good bye");
  } catch (err) {
    console.log("Something went wrong", err);
  }

  function sendEmail() {
    var transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL,
        pass: process.env.GMAIL_PWD
      }
    });

    ejs.renderFile(__dirname + "/template.hbs", (err, data) => {
      if (err) throw new Error("Error while rendering html template: ", err);

      var mailOptions = {
        from: process.env.GMAIL,
        to: process.env.GMAIL,
        subject: "Myntra | Price dropped alert",
        text: "Checkout below products",
        html: data
      };

      transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
          console.log("Error while sending email: ", error);
        } else {
          console.log("Email sent");
          clearFiles();
        }
      });
    });
  }

  async function scrapeInfiniteScrollItems(
    page,
    extractItems,
    scrollDelay = 800
  ) {
    let items = [];
    try {
      itemTargetCount = await page.evaluate(countTotalWishlistedItem);
      while (items.length < itemTargetCount - 1) {
        items = await page.evaluate(extractItems);
        previousHeight = await page.evaluate("document.body.scrollHeight");
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await page.waitFor(scrollDelay);
      }
    } catch (e) {
      console.log("error in scrapeInfiniteScrollItems: ", e);
    }
    return items;
  }

  function countTotalWishlistedItem() {
    return parseInt(
      document.getElementsByClassName("index-count")[0].innerText
    );
  }

  function extractItems() {
    const collectItems = [];

    const itemCount = document.querySelectorAll(".itemcard-itemCard").length;

    const itemNames = document.querySelectorAll(
      ".itemdetails-itemDetailsLabel"
    );
    const itemPrices = document.querySelectorAll(".itemdetails-boldFont");
    const itemActions = document.querySelectorAll(".itemcard-itemActions");
    const itemImages = document.querySelectorAll(".itemcard-itemImage");
    const itemLinks = document.querySelectorAll(".itemcard-itemImageDiv");

    for (let i = 0; i < itemCount; i++) {
      collectItems.push({
        link: itemLinks[i].firstChild.getAttribute("href"),
        image: itemImages[i].src,
        name: itemNames[i].innerText,
        price: itemPrices[i].innerText.replace(/\D/g, ""),
        inStock: itemActions[i].childElementCount === 2 ? true : false
      });
    }
    return collectItems;
  }

  function getHtmlTemplate() {
    return {
      "<>": "table",
      html: [
        {
          "<>": "tbody",
          html: [
            {
              "<>": "tr",
              html: [
                {
                  "<>": "td",
                  html: [
                    { style: "Width:80px", "<>": "img", src: "${image}" }
                  ]
                },
                {
                  "<>": "td",
                  html: [
                    {
                      style:
                        "padding-left:20px;color:#94989f;line-height:1.7;font-size:12px"
                    },
                    {
                      "<>": "span",
                      text: "${name}",
                      style: "color:#29303f;font-size:14px"
                    },
                    { "<>": "br" },
                    { "<>": "span", text: "Rs. ${price}" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  function clearFiles() {
    // Delete previous yesterday.json
    fs.unlink(yesterdayFilepath, err => {
      if (err) throw new Error("Error occured while deleting today.json");
    });
    // Rename file
    fs.rename(todayFilepath, yesterdayFilepath, err => {
      if (err)
        throw new Error("Error occured whlie renaming file yesterday.json");
    });
  }
}