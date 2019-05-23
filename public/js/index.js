"user strict";

$(document).ready(() => {
    $('#submitBtn').on('click', (e) => {
        e.preventDefault();

        $('#loadinImg').show();

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
                $('#loadinImg').hide();
                results = res.url.split(',');
                if (results === "") {
                    $('#nothing').show();
                } else {
                    $('#nothing').hide();
                    for (let index = 0; index < results.length; index++) {
                        const element = results[index];
                        $('#result').append(`
<div class="col-sm-3 resultCard">
    <div class="card text-center">
        <img src="${element}" class="card-img-top">
        <div class="card-body">
            <a href="${element}" class="btn btn-outline-secondary" target="_blank">點我開啟</a>
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
