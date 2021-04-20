"user strict";

var mhrSkills = {
    1: ['裝填擴充', 3],
    2: ['攻擊守勢', 3],
    3: ['最愛菇類', 3],
    4: ['拔刀術【技】', 3],
    5: ['拔刀術【力】', 3],
    6: ['收刀術', 3],
    7: ['KO術', 3],
    8: ['奪取耐力', 3],
    9: ['彈道強化', 3],
    10: ['會心擊【屬性】', 3],
    11: ['砲術', 3],
    12: ['跑者', 3],
    13: ['體術', 5],
    14: ['集中', 3],
    15: ['心眼', 3],
    16: ['火場怪力', 5],
    17: ['砲彈裝填', 3],
    18: ['防禦強化', 3],
    19: ['防禦性能', 5],
    20: ['耐力急速回復', 3],
    21: ['精神抖擻', 3],
    22: ['攻擊', 7],
    23: ['看破', 7],
    24: ['高速變形', 3],
    25: ['鈍器能手', 3],
    26: ['逆襲', 3],
    27: ['廣域化', 5],
    28: ['破壞王', 3],
    29: ['快吃', 3],
    30: ['精靈加護', 3],
    31: ['飛簷走壁', 3],
    32: ['翔蟲能手', 3],
    33: ['道具使用強化', 3],
    34: ['騎乘名人', 1],
    35: ['後座力減輕', 3],
    36: ['裝填速度', 3],
    37: ['砥石使用高速化', 3],
    38: ['體力回復量UP', 3],
    39: ['回復速度', 3],
    40: ['吹笛名人', 3],
    41: ['火屬性攻擊強化', 5],
    42: ['水屬性攻擊強化', 5],
    43: ['雷屬性攻擊強化', 5],
    44: ['冰屬性攻擊強化', 5],
    45: ['龍屬性攻擊強化', 5],
    46: ['毒屬性強化', 3],
    47: ['麻痺屬性強化', 3],
    48: ['睡眠屬性強化', 3],
    49: ['爆破屬性強化', 3],
    50: ['滑走強化', 1],
    51: ['炸彈客', 3],
    52: ['防禦', 3],
    53: ['剝取鐵人', 1],
    54: ['佯攻', 1],
    55: ['地質學', 3],
    56: ['植生學', 4],
    57: ['飢餓耐性', 3],
    58: ['泥雪耐性', 2],
    59: ['爆破異常狀態的耐性', 3],
    60: ['睡眠耐性', 3],
    61: ['麻痺耐性', 3],
    62: ['昏厥耐性', 3],
    63: ['毒耐性', 3],
    64: ['火耐性', 3],
    65: ['水耐性', 3],
    66: ['雷耐性', 3],
    67: ['冰耐性', 3],
    68: ['龍耐性', 3],
    69: ['屬性異常狀態的耐性', 3],
    70: ['耳塞', 5],
    71: ['泡沫之舞', 3],
    72: ['耐震', 3],
    73: ['抑制偏移', 2],
    74: ['減輕膽怯', 3],
    75: ['風壓耐性', 3],
    76: ['飛身躍入', 1],
    77: ['不屈', 1],
    78: ['死裡逃生', 3],
    79: ['挑戰者', 3],
    80: ['無傷', 3],
    81: ['怨恨', 3],
    82: ['超會心', 3],
    83: ['弱點特效', 3],
    84: ['力量解放', 3],
    85: ['匠', 5],
    86: ['利刃', 3],
    87: ['彈藥節約', 3],
    88: ['剛刃研磨', 3],
    89: ['強化持續', 3],
    90: ['特殊射擊強化', 2],
    91: ['通常彈・連射箭強化', 3],
    92: ['貫通彈・貫通箭強化', 3],
    93: ['散彈・擴散箭強化', 3],
    94: ['速射強化', 3],
    95: ['迴避性能', 5],
    96: ['迴避距離UP', 3],
    97: ['捕獲名人', 1],
    98: ['幸運', 3],
    99: ['滿足感', 3],
    100: ['跳躍鐵人', 1],
    101: ['鬼火纏身', 4],
    102: ['風紋一致', 5],
    103: ['雷紋一致', 5],
}

var mhrStones = {
    '痛風': [],
    '佐助': [],
}

$(document).ready(() => {
    let cookie = getCookie('isDark');
    if(cookie === 'true') {
        $('<link>').attr({
            'rel': 'stylesheet',
            'type': 'text/css',
            'href': 'css/styleDark.css'
        }).insertAfter('link:last');
        $('#darkBtn').attr('aria-pressed', true);
        $('#darkBtn').addClass('active');
    } else {
        setCookie('isDark', 'false', 365);
        $('link[href*="css/styleDark.css"]').remove();
    }

    $('nav').on('click', '#darkBtn', (e) => {
        let status = $('#darkBtn').attr('aria-pressed');
        if(status === 'false') {
            $('<link>').attr({
                'rel': 'stylesheet',
                'type': 'text/css',
                'href': 'css/styleDark.css'
            }).insertAfter('link:last');
            setCookie('isDark', 'true', 365);
        } else {
            setCookie('isDark', 'false', 365);
            $('link[href*="css/styleDark.css"]').remove();
        }
    });

    for (const key in mhrSkills) {
        let elem = mhrSkills[key];
        $('#s1-1,#s1-2,#s2-1,#s2-2,#s3-1,#s3-2,#s4-1,#s4-2,#s5-1,#s5-2').append(`<option value="${key}" data-lv="${elem[1]}">${elem[0]}</option>`);
    }

    $('#submitBtn').click(function() {
        let s1_1 = $('#s1-1').val();
        let s1_1_lv = $('#s1-1-lv').val();
        let s1_2 = $('#s1-2').val();
        let s1_2_lv = $('#s1-2-lv').val();
        let s1_3 = $('#s1-3').val();
        let s2_1 = $('#s2-1').val();
        let s2_1_lv = $('#s2-1-lv').val();
        let s2_2 = $('#s2-2').val();
        let s2_2_lv = $('#s2-2-lv').val();
        let s2_3 = $('#s2-3').val();
        let s3_1 = $('#s3-1').val();
        let s3_1_lv = $('#s3-1-lv').val();
        let s3_2 = $('#s3-2').val();
        let s3_2_lv = $('#s3-2-lv').val();
        let s3_3 = $('#s3-3').val();
        let s4_1 = $('#s4-1').val();
        let s4_1_lv = $('#s4-1-lv').val();
        let s4_2 = $('#s4-2').val();
        let s4_2_lv = $('#s4-2-lv').val();
        let s4_3 = $('#s4-3').val();
        let s5_1 = $('#s5-1').val();
        let s5_1_lv = $('#s5-1-lv').val();
        let s5_2 = $('#s5-2').val();
        let s5_2_lv = $('#s5-2-lv').val();
        let s5_3 = $('#s5-3').val();

        let targetArr = [];
        targetArr[0] = `${s1_1}_${s1_1_lv}_${s1_2}_${s1_2_lv}_${s1_3}`;
        targetArr[1] = `${s2_1}_${s2_1_lv}_${s2_2}_${s2_2_lv}_${s2_3}`;
        targetArr[2] = `${s3_1}_${s3_1_lv}_${s3_2}_${s3_2_lv}_${s3_3}`;
        targetArr[3] = `${s4_1}_${s4_1_lv}_${s4_2}_${s4_2_lv}_${s4_3}`;
        targetArr[4] = `${s5_1}_${s5_1_lv}_${s5_2}_${s5_2_lv}_${s5_3}`;

        stoneloop: for (const key in mhrStones) {
            let elem = mhrStones[key];
            targetloop: for (const target of targetArr) {
                if ($.inArray(target, elem) == -1) {

                }
            }
        }
    });
});

function getCookie(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for(var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function setCookie(cname, cvalue, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
  var expires = "expires="+d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}
