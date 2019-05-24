"user strict";

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

    $('#submitBtn').on('click', (e) => {
        e.preventDefault();

        rawData = $('#targetUrls').val();
        datas = rawData.split("\n");

        $.ajax({
            type: 'Post',
            url: 'api/',
            dataType: 'json',
            data: {
                'url': datas
            },
            success: (res) => {
                results = res.url.split(',');
                if (results === "") {
                    $('#nothing').show();
                } else {
                    $('#nothing').hide();
                    for (let index = 0; index < results.length; index++) {
                        const element = results[index];
                        $('#result').append(`
<div class="col-sm-3 resultCard mb-1">
    <div class="card text-center">
        <img src="${element}" class="card-img-top">
        <div class="card-body">
            <a href="${element}" class="btn btn-outline-secondary resultBtn" target="_blank">點我開啟</a>
        </div>
    </div>
</div>
                        `)
                    }
                }
            }
        });
    });

    $('#clearBtn').on('click', (e) => {
        $('.resultCard').remove();
        $('#targetUrls').val('');
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
