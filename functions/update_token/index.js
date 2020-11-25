const tcb = require('@cloudbase/node-sdk')
const axios = require("axios")
const qs = require('qs')

// 初始化
const app = tcb.init({
    env:tcb.SYMBOL_CURRENT_ENV
})
const db = app.database()

exports.main = async (event, context) => {
    // 获取所有人的信息
    let our_info_result = await db.collection('our_info').where({}).get()
    let our_result = our_info_result.data
    // 最后结果
    let result = []
    // 循环
    for(let index = 0;index < our_result.length;index++){
        let student = our_result[index]
        let token = await getToken(student.student_number,student.password)
        if(token){
            await db.collection('our_info').doc(student._id).update({
                cookie: token
            }).then(res => {
                const { updated } = res
                if( updated ){
                    result.push(`${student.name} token更新成功！`)
                }else{
                    result.push(`${student.name} token更新失败！`)
                }
            })
        }else{
            result.push(`${student.name} token更新失败！`)
        }
    }
    return result
}

// 获取token
async function getToken(account,password) {
    // 第一步：获取令牌（GET请求）
    const oauth2_url = 'http://dekt.jiangnan.edu.cn/oauth2/authorize?redirectUri='
    // state状态令牌
    let state = ''
    // Cookie
    let JSESSIONID = ''
    // 发送GET请求
    await axios.get(oauth2_url).then(res => {
        if(res.status === 200){
            state_url = res.request.res.responseUrl
            state = res.request.path.split("=")[5]
            JSESSIONID = res.headers["set-cookie"][0].split(";")[0]
            console.log(`\n 学号 ${account} 的状态令牌为 ${state} ; JSEssion为：${JSESSIONID} \n`)
            console.log(`\n 获取页面信息地址：${res.request.res.responseUrl} \n`)
        }
    }).catch(err => {
        console.log(`\n 获取令牌错误：${err} \n`)
    })

    // 第二步：登录（POST请求）
    // 登录网址
    const log_in_url = 'https://i.jiangnan.edu.cn/ssoserver/login'
    // 登录表单
    const log_in_data = {
        action: 'login',
        loginmode: 'web',
        logintype: 0,
        username: account,
        password: password,
        from: 'portal'
    } 
    // Cookie
    let CASTGC = ''
    // 发送登录请求
    await axios({
        headers: {
            "Cookie":`${JSESSIONID}`
        },
        method: 'post',
        url: log_in_url,
        data: qs.stringify(log_in_data)
    }).then(res => {
        if(res.status === 200){
            let student_number = res.data.split("'")[7]
            CASTGC = res.headers["set-cookie"][0].split(";")[0]
            console.log(`\n 学号 ${student_number} ,登录成功！\n CASTGC值为： ${CASTGC} \n`)
        }else{
            console.log(`\n 登录失败！${res} \n`)
        }
    }).catch(err => {
        console.log(`\n 登录错误：${err}  \n`)
    })

    // 第三步：获取token（POST请求）
    // 权限校验网址
    const authorize_url = 'https://i.jiangnan.edu.cn/ssoserver/moc2/authorize'
    const callback_url = 'http://dekt.jiangnan.edu.cn/oauth2/callback'
    // 权限码
    let token = ''
    // 校验表单
    authorize_data = {
        action:'login',
        loginmode:'web',
        username:account,
        password:password,
        auth:'',
        'sign_value':'',
        signfield:"cn",
        personfield:'uid',
        randomNumber:295592,
        logintype:0,
        response_type:'code',
        state:state,
        'client_id':'dekt',
        'redirect_uri':callback_url,
        display:null,
        scope:"scope_userinfo"
    }
    // 发送校验请求
    await axios({
        headers: {
            'Cookie':`${JSESSIONID}`
        },
        method: 'post',
        url: authorize_url,
        data: qs.stringify(authorize_data)
    }).then(res => {
        if(res.status === 200){
            token = res.request.res.responseUrl.split("=")[1]
            console.log(`更新后token为：${token}`)
        }else{
            console.log(`\n 更新token失败！${res} \n`)
        }
    }).catch(err => {
        console.log(`\n 校验错误：${err}  \n`)
    })
    return token
}