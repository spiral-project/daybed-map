var DefinitionCreate = Daybed.FormView.extend({
    model: MapModel,

    setup: function () {
        var instance = new this.model({
            id: this.modelname,
            title: this.modelname,
            description: this.modelname
        });
        return Daybed.FormView.prototype.setup.call(this, instance);
    },

    cancel: function () {
        Daybed.FormView.prototype.cancel.apply(this, arguments);
        app.navigate('', {trigger: true});
        return false;
    },

    /**
     * Redirect to list view.
     */
    success: function () {
        Daybed.FormView.prototype.success.apply(this, arguments);
        app.navigate(this.modelname, {trigger: true});
        return false;
    }
});


var AddView = Daybed.RecordFormView.extend({
    model: MapRecord,

    initialize: function () {

        Daybed.RecordFormView.prototype.initialize.call(this);
        this.map = this.options.map;
        this.collection = this.options.collection;
        this.layer = null;

        var geomField = this.definition.geomField();
        if (!geomField) return;

        // Assign dedicated layer editor from geometry field type
        var handlers = {
            'point': new L.Draw.Marker(this.map),
            'line': new L.Draw.Polyline(this.map),
            'polygon': new L.Draw.Polygon(this.map)
        };
        this.handler = handlers[geomField.type];
        this.map.on('draw:created', this.onDraw, this);
        // Refresh newly created layer on form change
        this.form.on('change', this.refreshNewLayer, this);
    },

    render: function () {
        Daybed.RecordFormView.prototype.render.apply(this, arguments);
        if (this.handler) {
            this.handler.enable();
            this.$el.append('<span class="map-help alert">Click on map</span>');
        }
        return this;
    },

    close: function (e) {
        if (this.handler) {
            this.handler.disable();
            if (this.layer) this.map.removeLayer(this.layer);
            this.layer = null;
        }
        this.trigger('close');
        this.remove();
        return false;
    },

    cancel: function () {
        this.close();
        return false;
    },

    success: function () {
        this.close();
        return false;
    },

    submit: function(e) {
        Daybed.RecordFormView.prototype.submit.apply(this, arguments);
        this.collection.create(this.instance, {wait: true});
    },

    onDraw: function (e) {
        this.layer = e.layer;
        this.refreshNewLayer();
        this.layer.addTo(this.map);
        this.$el.find('.map-help').remove();

        // Make it editable and save while editing
        this.layer[this.layer instanceof L.Marker ? 'dragging' : 'editing'].enable();
        this.layer.on('dragend edit', function storefield (e) {
            this.instance.setLayer(e.target);
        }, this);
        this.layer.fire('edit');  // store once
    },

    refreshNewLayer: function () {
        if (!this.layer)
            return;
        var style = L.Util.extend({}, window.DAYBED_SETTINGS.STYLES['default']),
            colorField = this.definition.colorField(),
            iconField = this.definition.iconField();
        var data = this.form.getValue(),
            color = colorField ? data[colorField.name] : style.color;
        // Refresh layer color
        if (typeof this.layer.setStyle == 'function') {
            style.color = color;
            style.fillColor = color;
            this.layer.setStyle(style);
        }
        // Refresh Marker color and icon
        if (iconField && typeof this.layer.setIcon == 'function') {
            var marker = {icon: data[iconField.name], color: color};
            this.layer.setIcon(L.AwesomeMarkers.icon(marker));
        }
    }
});


var ListView = Backbone.View.extend({
    template: Mustache.compile('<div id="map"></div>' +
                               '<h1>{{ definition.title }}</h1>' +
                               '<p>{{ definition.description }}</p><div id="toolbar"><a id="add" class="btn">Add</a></div>' +
                               '<div id="list"></div>'),

    events: {
        "click a#add": "addForm",
        "click a.close": "deleteRecord"
    },

    initialize: function (definition) {
        this.definition = definition;
        this.map = null;
        this.grouplayer = L.featureGroup();

        this.collection = new MapRecordList(definition);
        this.collection.bind('add', this.addOne, this);
        // Fit map to layer bounds when both collection and map are ready
        this.collection.bind('sync', function () {
            // Zoom-in effet
            setTimeout((function () {
                if (this.map)
                    this.map.fitBounds(this.grouplayer.getBounds());
            }).bind(this), 1500);
        }, this);
        // Fetch records!
        this.collection.fetch();
    },

    render: function () {
        this.$el.html(this.template({definition: this.definition.attributes}));
        this.$("#list").html(this.tableContent(this.definition));

        // If definition contains geometry field, shows the map.
        var $map = this.$("#map");
        if (this.definition.geomField() !== null) {
            this.map = L.map($map[0]).setView([0, 0], 3);
            this.map.attributionControl.setPrefix('');
            L.tileLayer(Daybed.SETTINGS.TILES).addTo(this.map);
            this.grouplayer.addTo(this.map);
        }
        else {
            $map.hide();
            $('#list').width('100%');
        }
        return this;
    },

    addForm: function (e) {
        e.preventDefault();

        this.addView = new AddView({map:this.map,
                                    definition:this.definition,
                                    collection:this.collection});
        this.addView.on('close', function () {
            this.$("a#add").show();
        }, this);
        this.$("a#add").hide();
        this.$("a#add").after(this.addView.render().el);
    },

    addOne: function (record) {
        var tpl = this.templateRow(this.definition);
        this.$('table tbody').prepend(tpl(record.toJSON()));
        this.$('span.count').html(this.collection.length);

        var layer = record.getLayer();
        if (layer) {
            var style = L.Util.extend({}, Daybed.SETTINGS.STYLES['default']);

            // Has color ?
            var colorField = this.definition.colorField();
            if (colorField) {
                style.color = record.get(colorField.name);
                style.fillColor = style.color;
            }
            // Has icon ?
            var iconField = this.definition.iconField();
            if (iconField && 'point' == record.definition.geomField().type) {
                var marker = L.AwesomeMarkers.icon({
                    color: style.color,
                    icon: record.get(iconField.name)
                });
                layer = L.marker(layer.getLatLng(), {icon: marker, bounceOnAdd: true});
            }
            else {
                layer.setStyle(style);
            }

            layer.bindPopup(this.templatePopup(this.definition)(record.toJSON()));
            this.grouplayer.addLayer(layer);

            // Row and map records highlighting
            var row = this.$("tr[data-id='" + record.get('id') + "']");
            layer.on('mouseover', function (e) {
                if (this.setStyle) this.setStyle(window.DAYBED_SETTINGS.STYLES.highlight);
                // Pop on top
                if (typeof this.bringToFront == 'function')
                    this.bringToFront();
                row.addClass('success')
                   .css("opacity", "0.1")
                   .animate({opacity: 1.0}, 400);
            }, layer);
            layer.on('mouseout',  function (e) {
                if (this.setStyle) this.setStyle(style);
                row.removeClass('success');
            }, layer);

            layer.on('click', function (e) {
                window.scrollTo(0, row.offset().top);
            });

            row.hoverIntent(function () {
                if (typeof layer.bounce == 'function')
                    layer.bounce(300, 50);
                layer.fire('mouseover');
            },
            function () {
                layer.fire('mouseout');
            });

            var map = this.map;
            row.on('dblclick', function () {
                if (typeof layer.getLatLng == 'function')
                    map.panTo(layer.getLatLng());
                else
                    map.fitBounds(layer.getBounds());
                layer.openPopup();
            });
        }
    },

    deleteRecord: function (e) {
        e.preventDefault();

        var $row = $(e.target).parents('tr'),
            id = $row.data('id'),
            record = this.collection.get(id);
        if (confirm("Are you sure ?") === true) {
            record.destroy({wait: true});
            this.map.removeLayer(record.layer);
            this.collection.remove(record);
            $row.remove();
        }
    },

    templatePopup: function (definition) {
        var c = '<div>';
        $(definition.mainFields()).each(function (i, f) {
            c += '<li title="' + f.description + '"><strong>' + f.name + '</strong>: {{ ' + f.name + ' }}</li>';
        });
        c += '</div>';
        return Mustache.compile(c);
    },
});


var HomeView = Backbone.View.extend({
    template: Mustache.compile('<div class="hero-unit"><h1>Daybed Map</h1>' +
                               '<p>Join an existing map or create a new one.</p>' +
                               '<input id="modelname" placeholder="Name"/> <a id="go" href="#" class="btn">Go</a></div>'),

    events: {
        "keyup input#modelname": "setLink"
    },

    render: function () {
        this.$el.html(this.template({}));
        setTimeout(function () {
            $('#modelname').focus();
        }, 0);
        return this;
    },

    setLink: function (e) {
        if (e.which == 13) { // Enter
            app.navigate($(e.target).val(), {trigger:true});
        }
        this.$("#go").attr("href", '#' + $(e.target).val());
    }
});
