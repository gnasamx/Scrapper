const puppeteer = require("puppeteer");
const jsonfile = require("jsonfile");
var nodemailer = require("nodemailer");
require("dotenv").config();

const todayFilepath = "./today.json";
const yesterdayFilepath = "./yesterday.json";
let itemTargetCount = 0;

(async () => {
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
    jsonfile.writeFile("./today.json", items, { spaces: 2 });

    // Comporing data
    const todayFile = await jsonfile.readFile(todayFilepath);
    const yesterdayFile = await jsonfile.readFile(yesterdayFilepath);
    const priceDown = [];

    for (let i = 0; i < itemTargetCount; i++) {
      if (todayFile[i].price < yesterdayFile[i].price) {
        priceDown.push(todayFile[i]);
      }
    }
    console.log("price down: ", priceDown);

    if (priceDown.length > 0) {
      var transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL,
          pass: process.env.GMAIL_PWD
        }
      });

      var mailOptions = {
        from: process.env.GMAIL,
        to: process.env.GMAIL,
        subject: "Myntra | Price dropped alert",
        text: JSON.stringify(priceDown)
      };

      transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
          console.log("Error while sending email: ", error);
        } else {
          console.log("Email sent: " + info.response);
        }
      });
    }

    browser.close();
    console.log("Good bye");
  } catch (err) {
    console.log("Something went wrong", err);
    process.exit();
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

    for (let i = 0; i < itemCount; i++) {
      collectItems.push({
        name: itemNames[i].innerText,
        price: itemPrices[i].innerText.replace(/\D/g, ""),
        inStock: itemActions[i].childElementCount === 2 ? true : false
      });
    }

    console.log("collectedItems: ", collectItems);

    return collectItems;
  }
})();
