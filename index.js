require('dotenv').config();

const logger = require('winston');
const json2csv = require('json2csv');
const fs = require('fs');
let req = require('request');
const url = 'https://www.instagram.com';
const jar = req.jar();
req = req.defaults({jar});

function getCookieValue(token, regex) {
    if (regex) {
        return new RegExp(`${token}=(${regex}); `).exec(jar.getCookieString(url))[1];
    }
    return new RegExp(`${token}=(.*); `).exec(jar.getCookieString(url))[1];
}

function request(options, resolve, reject) {
    if (!resolve && !reject) {
        return new Promise((resolve, reject)=>{
            req(options, (err, response)=>{
                if (err) {
                    return reject(err);
                }
                resolve(response);
            });
        });
    } 
}

function parseResponse(list, edge, next, resolve) {
    return (response)=>{    
        const body = JSON.parse(response.body);
        const { edges, page_info } = body.data.user[edge];

        const { end_cursor, has_next_page } = page_info;

        list = list.concat(edges.map((user)=>user.node).map((node)=>({
            username: node.username,
            name: node.full_name
        })));

        if (has_next_page) {
            next(list, end_cursor);
        }
        else {
            resolve(list);
        }         
    };
}

function getUsers(edge, queryId, list) {
    return new Promise((resolve) => {
        let i = 1;
        (function step(acc, cursor) {
            let followersUrl = `${url}/graphql/query/?query_id=${queryId}&variables={"id":"${getCookieValue('ds_user_id', '[0-9]+')}","first":100`;
            if (cursor) {
                followersUrl = `${followersUrl},"after":"${cursor}"}`;
            }
            else {
                followersUrl = `${followersUrl}}`;
            }
            logger.info(`Request Page ${i++} of ${edge}`);
            return request({
                url: followersUrl, 
                headers: {
                    'x-requested-with': 'XMLHttpRequest'
                }
            }).then(parseResponse(acc, edge, step, resolve));
        }(list));
    });
}

function getAllUsers() {
    let followers = [];
    let following = [];
    return getUsers('edge_followed_by', '17851374694183129', followers)
        .then((list) => followers = list)
        .then(() => getUsers('edge_follow', '17874545323001329', following))
        .then((list) => following = list)
        .then(()=>({
            followers,
            following
        }));
}


request({url}).then(() => { 
    return request({
        method: 'POST',
        url: `${url}/accounts/login/ajax/`, 
        headers: {
            'x-csrftoken': getCookieValue('csrftoken'),
            'x-instagram-ajax': 1,
            'x-requested-with': 'XMLHttpRequest',
            'origin': 'https://www.instagram.com',
            'referer': 'https://www.instagram.com/'
        },
        form: {
            username: process.env.USERNAME,
            password: process.env.PASSWORD
        }
    });
}).then(getAllUsers).then(({followers, following})=>{
    const removable = following.filter(follow => !followers.find(follower => follower.username == follow.username));
    const csv = json2csv({ data: removable, fields: ['username', 'name']});
    fs.writeFileSync('users.csv', csv);
}).catch(logger.error);