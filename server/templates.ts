import { emptyGraph,makePiece,makeConnection,validateGraph,type PieceType } from '../lib/world.ts';

// Prices and source definitions are server-owned. The catalog exposes descriptions only.
export const TEMPLATES=[
    {id:'launch',version:1,name:'Launch',ar:'انطلاقة',amount:2_000_000,pages:2,description:'A landing page and contact page with a working enquiry form.',descriptionAr:'صفحة تعريف وصفحة تواصل مع نموذج استفسارات يعمل.',accent:'#114bff'},
    {id:'catalog',version:1,name:'Product catalog',ar:'كتالوج المنتجات',amount:3_000_000,pages:3,description:'A home page, editable product catalog and enquiry form. No checkout integration.',descriptionAr:'رئيسية وكتالوج منتجات قابل للتعديل ونموذج استفسار. لا يشمل ربط الدفع.',accent:'#d7b445'},
    {id:'portfolio',version:1,name:'Portfolio',ar:'ملف الأعمال',amount:3_000_000,pages:3,description:'An introduction, selected projects and a contact page.',descriptionAr:'تعريف ومشاريع مختارة وصفحة تواصل.',accent:'#9873d8'}
] as const;
export function templateGraph(templateId:string,ar:boolean) {
    const spec=TEMPLATES.find(t=>t.id===templateId);if(!spec)throw Error('Unknown template');
    const g=emptyGraph(),t=(en:string,a:string)=>ar?a:en;
    const pageNames=spec.pages===2?[t('Home','الرئيسية'),t('Contact','تواصل معنا')]:[t('Home','الرئيسية'),templateId==='catalog'?t('Products','المنتجات'):t('Our work','أعمالنا'),t('Contact','تواصل معنا')];
    const pages=pageNames.map((name,i)=>{const p=makePiece('page',null,80+i*1100,80);p.name=name;p.w=960;p.h=1000;p.style.background='#f8f7f3';p.mobile={w:390,h:1100};g.pieces.push(p);return p;});g.entries=[pages[0].id];
    const part=(type:PieceType,parent:string,x:number,y:number,w:number,h:number)=>{const p=makePiece(type,parent,x,y);p.w=w;p.h=h;g.pieces.push(p);return p;};
    for(const [index,page] of pages.entries()) {
        const brand=part('text',page.id,40,28,400,40);brand.props.text=t('YOUR BRAND','علامتك التجارية');brand.style.fontSize=20;brand.style.color='#17191f';brand.style.fontWeight=700;brand.mobile={x:24,y:20,w:340,h:40};
        for(const [n,destination] of pages.entries()){const b=part('button',page.id,40+n*190,86,175,42);b.props.text=destination.name;b.props.action='navigate';b.style.background=destination.id===page.id?spec.accent:'#e7e5df';b.style.color=destination.id===page.id?'#ffffff':'#17191f';b.mobile={x:24+n*115,y:76,w:105,h:42};g.connections.push(makeConnection(b.id,destination.id));}
        const heading=part('text',page.id,40,176,830,130);heading.props.text=index===0?t('Ideas with purpose.\nMade for your world.','أفكار لها أثر.\nصُمّمت لعالمك.'):page.name;heading.style.fontSize=54;heading.style.fontWeight=700;heading.style.color='#17191f';heading.mobile={x:24,y:155,w:342,h:150,style:{fontSize:36}};
        if(index===pages.length-1){const note=part('text',page.id,40,325,820,60);note.props.text=t('Tell us what you have in mind. We will be in touch.','أخبرنا بما تفكر فيه، وسنتواصل معك.');note.style.fontSize=20;note.mobile={x:24,y:320,w:342,h:70};
            const form=part('form',page.id,40,430,820,390);form.props.title=t('Send an enquiry','أرسل استفسارك');form.props.submitLabel=t('Send message','إرسال الرسالة');form.mobile={x:24,y:420,w:342,h:430};
            const name=part('input',form.id,24,55,750,60);name.props.label=t('Name','الاسم');name.props.field='name';name.props.inputType='text';name.props.placeholder=t('Name','الاسم');name.name=t('Name','الاسم');name.props.required=true;name.mobile={x:16,y:55,w:310,h:60};
            const email=part('input',form.id,24,140,750,60);email.props.label=t('Email','البريد الإلكتروني');email.props.field='email';email.props.placeholder=t('Email','البريد الإلكتروني');email.name=t('Email','البريد الإلكتروني');email.props.inputType='email';email.props.required=true;email.mobile={x:16,y:140,w:310,h:60};
            const message=part('input',form.id,24,225,750,65);message.props.label=t('Message','الرسالة');message.props.field='message';message.props.inputType='text';message.props.placeholder=t('Message','الرسالة');message.name=t('Message','الرسالة');message.props.required=true;message.mobile={x:16,y:225,w:310,h:65};
        }else if(index===0){const intro=part('text',page.id,40,340,770,100);intro.props.text=t('Introduce your business, share what makes it special, and invite people to take the next step. Every element is yours to edit.','عرّف بنشاطك وما يجعله مميزًا، وادعُ الزوار للخطوة التالية. كل عنصر قابل للتعديل.');intro.style.fontSize=22;intro.mobile={x:24,y:330,w:342,h:140};
            const cta=part('button',page.id,40,490,250,58);cta.props.text=pages[1].name;cta.props.action='navigate';cta.style.background=spec.accent;cta.style.color='#ffffff';cta.mobile={x:24,y:500,w:280,h:58};g.connections.push(makeConnection(cta.id,pages[1].id));
            const panel=part('shape',page.id,40,630,870,230);panel.style.background=spec.accent;panel.style.borderRadius=24;panel.mobile={x:24,y:630,w:342,h:200};
            const label=part('text',page.id,72,682,780,100);label.props.text=t('Your next chapter\nstarts here.','فصلك القادم\nيبدأ هنا.');label.style.color='#ffffff';label.style.fontSize=36;label.mobile={x:44,y:680,w:300,h:120,style:{fontSize:30}};
        }else for(let i=0;i<3;i++){const card=part('section',page.id,40+i*290,350,270,330);card.style.background='#ffffff';card.style.borderRadius=20;card.mobile={x:24,y:340+i*220,w:342,h:200};const title=part('text',card.id,20,32,230,70);title.props.text=templateId==='catalog'?t(`Product ${i+1}`,`منتج ${i+1}`):t(`Project ${i+1}`,`مشروع ${i+1}`);title.style.fontSize=25;title.style.fontWeight=700;title.mobile={x:20,y:24,w:290,h:60};const desc=part('text',card.id,20,122,230,150);desc.props.text=t('Add your description, features and images here.','أضف الوصف والمميزات والصور هنا.');desc.style.fontSize=18;desc.mobile={x:20,y:105,w:290,h:75};}
    }
    return validateGraph(g);
}
