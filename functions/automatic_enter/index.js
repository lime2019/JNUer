const tcb = require('@cloudbase/node-sdk')
const axios = require('axios')
const nodemailer = require('nodemailer')

// 初始化
const app = tcb.init({
    env:tcb.SYMBOL_CURRENT_ENV
})
const db = app.database()

exports.main = async (event, context) => {
    // 获取环境变量中邮箱信息
    const { my_email_address,my_email_secret_key } = JSON.parse(context.environment)
    // 可报名的活动信息列表
    let new_activity_list = await getActivities()
    // 如果此列表不为空，则进行报名及发送通知邮件
    if(new_activity_list.length){
        await signUpActivities(new_activity_list,my_email_address,my_email_secret_key)
        // 给订阅最新活动通知的用户发送邮件
        await sendMailToStudent(new_activity_list,my_email_address,my_email_secret_key)
    }
    // 返回可报名的列表
    return new_activity_list
};

// 获取可报名的活动信息列表
async function getActivities(){
    // 当前活动列表
    let now_activity_list = []
    // 可报名的活动列表
    let enter_activity_list = []
    // 获取当前数据库中可供查询的数量
    const {total} = await db.collection('our_info').count()
    // 生成随机数
    let random_id = parseInt(Math.floor(Math.random()*total))
    // 获取ID为randomId的个人信息
    let info_result = await db.collection('our_info').where({
        id:random_id
    }).get()
    const {student_number,cookie} = info_result.data[0]
    console.log(`\n 使用ID为：${random_id}，学号为：${student_number}信息进行查询 \n`)
    // 发送GET请求获取“招募中”的活动信息（参数type为2）
    await axios.get('http://dekt.jiangnan.edu.cn/biz/activity/student/list',{
        params: {
            hdmc:'',
            orgId:'',
            size:50,
            page:1,
            userId:student_number,
            xyId:12200,
            grade:2018,
            type:2
        },
        headers:{
            'Authorization':`Bearer ${cookie}`,
            'Cookie':`token_type=Bearer; id_token=${cookie}`,
        }
    }).then(res => {
        const total_activity_result = res.data
        if(total_activity_result.data.code === 401){
            console.log(`学号为${student_number}账号token已过期`)
        }else{
            console.log(`\n 当前有${total_activity_result.data.total}个“招募中”活动 \n`)
            now_activity_list = total_activity_result.data.list
            for(let i = 0;i< total_activity_result.data.total;i++){
                console.log(`\n 活动${i}名称：${now_activity_list[i].hdmc}，学时：${now_activity_list[i].xs}，人数：${now_activity_list[i].zmrs}，报名人数：${now_activity_list[i].bmrs} \n`)
            }
        }
    }).catch(err => {
        console.log(`\n 发送查询“招募中”活动列表信息失败，错误原因为：${err} \n`)
    })
    // 判断活动是否可参加
    for(let index = 0;index < now_activity_list.length;index++){
        const {id,hdmc,hddd,xs,zmrs,bmrs,bmkssj,bmjssj,kssj,jssj,hdjbf,hdjj} = now_activity_list[index]
        if(bmrs < zmrs){
            // 校验活动id是否已存在
            let check_result = await db.collection('activities_list').where({
                activity_id:id
            }).get()
            if(check_result.data.length === 0){
                // 活动信息不在数据库中
                let activity = {
                    activity_id:id,
                    activity_name:hdmc,
                    activity_place:hddd,
                    activity_class_hour:xs,
                    activity_recruit_number:zmrs,
                    activity_enter_number:bmrs,
                    activity_enter_start_time:bmkssj,
                    activity_enter_end_time:bmjssj,
                    activity_start_time:kssj,
                    activity_end_time:jssj,
                    activity_organizer:hdjbf,
                    activity_introduction:hdjj
                }
                enter_activity_list.push(activity)
            }
        }
    }
    // 返回可参加的活动信息列表
    return enter_activity_list
}

// 报名
async function signUpActivities(enter_activities,my_email_address,my_email_secret_key){
    // 获取所有人的信息
    let our_info_result = await db.collection('our_info').where({}).get()
    let our_result = our_info_result.data
    // 自动报名
    for(let index = 0; index < enter_activities.length ; index++){
        // 获取一个活动信息
        let enter_activity = enter_activities[index]
        console.log(`\n ${enter_activity.activity_name}活动ID为${enter_activity.activity_id} \n`)
        // 避免避免班级的团日活动
        if(enter_activity.activity_recruit_number > 30){
            // 对所有自动报名人员进行报名
            for(let people_index = 0;people_index < our_result.length ; people_index++){
                // 获取一个人的信息
                const {email,name,cookie} = our_result[people_index]
                console.log(`\n ${name}的email为${email} \n`)
                let email_subject = `第二课堂新活动，自动报名成功`
                let email_html = `<h3>${name}同学，你的“${enter_activity.activity_name}”活动自动报名成功</h3>
                <div>活动学时：${enter_activity.activity_class_hour}；活动地点：${enter_activity.activity_place}</div>
                <div>报名开始时间：${enter_activity.activity_enter_start_time}；报名结束时间：${enter_activity.activity_enter_end_time}</div>
                <div>活动开始时间：${enter_activity.activity_start_time}；活动结束时间：${enter_activity.activity_end_time}</div>
                <div>活动招募人数：${enter_activity.activity_recruit_number}；当前报名人数：${enter_activity.activity_enter_number}</div>
                <div>活动举办方：${enter_activity.activity_organizer}</div>
                <div>活动简介：${enter_activity.activity_introduction}</div>`
                let email_flag = false
                // 发送报名请求
                await axios.post('http://dekt.jiangnan.edu.cn/biz/activity/signup',{
                    id:enter_activity.activity_id
                },{
                    headers:{
                        'Authorization':`Bearer ${cookie}`,
                        'Cookie':`token_type=Bearer; id_token= ${cookie}`
                    }
                }).then(res =>{
                    const enter_result = res.data
                    let code = enter_result.code
                    switch (code) {
                        case 401:
                            console.log(`\n ${name}报名失败，token失效，${enter_result.msg} \n`)
                            break
                        case 400:
                            console.log(`\n ${name}报名失败，失败信息为：${enter_result.msg} \n`)
                            break
                        case 200:
                            if(enter_result.data.errcode){
                                console.log(`\n ${name}报名成功 \n`)
                                email_flag = true
                            }else{
                                console.log(`\n ${name}报名失败，当前活动报名人数已满 \n`)
                            }
                            break
                        default:
                            console.log(`\n 未知错误，相关信息${enter_result} \n`)
                            break
                    }
                }).catch(err => {
                    console.log(err)
                })
                // 发送报名成功邮件
                if(email_flag){
                    await sendEMail(email,email_subject,email_html,my_email_address,my_email_secret_key,enter_activity.activity_name)
                }
            }
        }
    }
}

// 发送邮件给订阅的用户
async function sendMailToStudent(activities,my_email_address,my_email_secret_key){
    // 获取全部订阅用户信息
    let email_result = await db.collection('email_list').where({
        email_is_deleted:false
    }).get()
    let email_info = email_result.data
    // 将订阅用户邮箱转换成字符串，使用逗号隔开
    let mail_address = ''
    for(let email_index = 0; email_index < email_info.length ; email_index++){
        const { email_address } = email_info[email_index]
        let new_mail_address = `${email_address},${mail_address}`
        mail_address = new_mail_address
    }
    console.log(`\n ${mail_address} \n`)
    // 发送邮件
    for(let activity_index = 0 ; activity_index < activities.length ; activity_index++){
        let enter_activity = activities[activity_index]
        // 生成邮件HTML
        email_html = `<h3>${enter_activity.activity_name}</h3>
        <div>活动学时：${enter_activity.activity_class_hour}；活动地点：${enter_activity.activity_place}</div>
        <div>报名开始时间：${enter_activity.activity_enter_start_time}；报名结束时间：${enter_activity.activity_enter_end_time}</div>
        <div>活动开始时间：${enter_activity.activity_start_time}；活动结束时间：${enter_activity.activity_end_time}</div>
        <div>活动招募人数：${enter_activity.activity_recruit_number}；当前报名人数：${enter_activity.activity_enter_number}</div>
        <div>活动举办方：${enter_activity.activity_organizer}</div>
        <div>活动简介：${enter_activity.activity_introduction}</div>`
        sendEMail(mail_address,'第二课堂有活动开始报名了！',email_html,my_email_address,my_email_secret_key,enter_activity.activity_name)
        // 将活动ID存储到数据库中
        await db.collection('activities_list').add({
            activity_id:enter_activity.activity_id,
            "活动名称":enter_activity.activity_name,
            "活动结束时间":enter_activity.activity_end_time,
            "记录创建时间":db.serverDate()
        })
    }
}

// 发送邮件
function sendEMail(mailAddress,mailSubject,mailMessage,my_email_address,my_email_secret_key,activity_name){
    // 创建邮件发送接口对象
    const transporter = nodemailer.createTransport({
        host:"smtp.qq.com",
        port:465,
        secure:true,
        auth:{
            user:my_email_address,
            pass:my_email_secret_key
        }
    })
    // 发送邮件消息对象
    const msg = {
        from:`江大第二课堂 <${my_email_address}>`,
        to:mailAddress,
        subject:mailSubject,
        html:mailMessage
    }
    // 发送邮件
    transporter.sendMail(msg,(err,res) => {
        if(err){
            console.log(`\n ${activity_name}活动，${mailSubject}邮件发送失败，失败原因为${err} \n`)
        }
        if(res){
            console.log(` ${activity_name}活动，${mailSubject}邮件发送成功 \n`)
        }
    })
}