"user strict";

$(document).ready(() => {
    const params = new URLSearchParams(window.location.search);
    const targetUrl = params.get("url");
    if (targetUrl != null) {
        $('#targetUrls').val(targetUrl);

        rawData = targetUrl;
        datas = rawData.split("\n");

        callApi(datas);

        window.history.pushState({ 'page_id': 1}, '', window.location.href.split('?url')[0]);
    }

    $('#submitBtn').on('click', (e) => {
        e.preventDefault();

        rawData = $('#targetUrls').val();
        datas = rawData.split("\n");

        callApi(datas);
        $('#submitBtn').prop('disabled', true);
        setTimeout(() => {
            $('#submitBtn').prop('disabled', false);
        }, 5000);
    });

    $('#clearBtn').on('click', (e) => {
        $('.resultCard').remove();
        $('#targetUrls').val('');
    });
});

function callApi(datas) {
    $.ajax({
        type: 'Post',
        url: 'api/web/',
        dataType: 'json',
        data: {
            'url': datas
        }
    }).done((res) => {
        $('#submitBtn').prop('disabled', false);
        results = res.url.split(',');
        if (results === "") {
            $('#nothing').show();
        } else {
            $('#nothing').hide();
            for (let index = 0; index < results.length; index++) {
                const element = results[index];

                if (/jpe?g/i.test(element)) {
                    $('#result').append(`
<div class="col-sm-3 resultCard mb-1">
    <div class="card text-center">
        <img src="${element}" class="card-img-top">
        <div class="card-body">
            <a href="${element}" class="btn btn-outline-secondary resultBtn" target="_blank">點我開啟</a>
        </div>
    </div>
</div>
                    `);
                } else if (/mp4/i.test(element)) {
                    $('#result').append(`
<div class="col-sm-3 resultCard mb-1">
    <div class="card text-center">
        <video controls width="250" preload="none">
            <source src="${element}"
                    type="video/mp4">
            Sorry, your browser doesn't support embedded videos.
        </video>
        <div class="card-body">
            <a href="${element}" class="btn btn-outline-secondary resultBtn" target="_blank">點我開啟</a>
        </div>
    </div>
</div>
                    `);
                } else {
                    $('#result').append(`
<div class="col-sm-3 resultCard mb-1">
    <div class="card text-center">
        <div class="card-body">
            <p>${element}</p>
        </div>
    </div>
</div>
                    `);
                }


            }
        }
    }).fail(() => {
        $('#submitBtn').prop('disabled', false);
        $('#nothing').show();
    });
}
